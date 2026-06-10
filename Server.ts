import util                     from 'node:util';
import net                      from 'node:net';
import repl                     from 'node:repl';

import { SDK as RCSDK }         from '@ringcentral/sdk';
import nodemailer               from 'nodemailer';
import * as ws                  from 'ws';

import dayjs                    from './day-timezone';
import Config                   from './Config';
import Contact                  from './Contact';
import { ElevenLabsApi }        from './ElevenLabsApi';
import * as RingCentral         from './RingCentral';

export let server = {} as Server;

export default class Server {
    //
    config                  : Readonly<Config>;
    ringCentral             : RingCentral.RingCentral;
    nmTransport             : (nodemailer.Transporter|undefined);
    wsByUrl                 : Record<string,ws.WebSocket>; 
    elevenLabsApi           : ElevenLabsApi;
    //
    module_log_level        : Record<string,number> = {};
    ban_vape_api_until_date?: Date;

    constructor() {
        server = this;
        this.config         = new Config(require('./config.js').default);
        this.nmTransport    = nodemailer.createTransport(this.config.nm);
        this.wsByUrl        = {};
        this.elevenLabsApi  = new ElevenLabsApi();
        this.ringCentral    = new RingCentral.RingCentral(this.config.contacts.rc);
        this.initREPL();
        return this;
    }
    async init() : Promise<Server> {
        await this.ringCentral.login();
        this.moduleLog(module.filename,1,`Server initialized with provider ${this.config.providerType}`);
        return this;
    }
    private initREPL() {
        if( this.config.replPort<=0 )
          return;
        // Follows https://gist.github.com/TooTallNate/2209310
        // To use this run `rlwrap telnet localhost 1338`
        net.createServer( (socket:net.Socket) => {
            this.log(1,`Started REPL server for ${socket.remotePort}@${socket.remoteAddress}`);
            const server = repl.start({
                prompt      : 'TT> ',
                input       : socket,
                output      : socket,
                terminal    : true,
                useGlobal   : false,
                completer   : function( line:string ) {
                    // tslint:disable:no-console
                    console.log(`completer.this=`,this);
                    return [[],line];
                }
            });
            server.context.socket = socket;
            server.context.server = this;
            server.on('error',() => {
                this.log(1,`repl error event, closing socket with ${socket.remotePort}@${socket.remoteAddress}`);
                socket.end();
            });
            server.on('exit',() => {
                this.log(1,`repl exit event, closing socket with ${socket.remotePort}@${socket.remoteAddress}`);
                socket.end();
            });
        }).listen({
            port : this.config.replPort||1338,
            host : "localhost"
        });        
    }
    private log_prefix( level:number ) {
        return `${dayjs().format("YYYY-MM-DD HH:mm:ss")}:${level}`;
    }
    log( level:number, ...args:any[] ) {
        if( this.config.loglevel >= level ) {
            // tslint:disable:no-console
            console.log(`${this.log_prefix(level)}: ` + util.format(...args));
        }
        return this;
    }
    moduleLog( filename:string, level:number, ...args:any[] ) {
        const modname  = (filename.startsWith(this.config.path) ? filename.substring(this.config.path.length) : filename).replace(/^.*\/([^/\.]+)\.[^\.]+$/,"$1");
        const loglevel = (modname in this.module_log_level) ? this.module_log_level[modname] : this.config.loglevel;
        if( loglevel>=level ) {
            // tslint:disable:no-console
            console.log(`${this.log_prefix(level)}: ` + util.format(modname,...args));
        }
        return this;
    }    
    sendEmail(args:{ to:string, subject:string, text:string }) : Promise<void> {
        if( !this.nmTransport )
            throw Error(`Transport is not initialized`);
        return this.nmTransport.sendMail({
            from    : this.config.nm.from,
            to      : args.to,
            subject : args.subject,
            text    : args.text
        });
    }
    banVapeApi( seconds?: number ) {
        const sec = seconds ?? this.config.vapeApi.banPeriodSec;
        this.ban_vape_api_until_date = new Date(Date.now() + sec * 1000);
        this.log(1,`VapeApi manually banned for ${sec}s (until ${this.ban_vape_api_until_date.toISOString()})`);
    }
    unbanVapeApi() {
        this.ban_vape_api_until_date = undefined;
        this.log(1,`VapeApi ban cleared`);
    }
    async getContacts( warns?: string[] ) : Promise<Contact[]> {
        if( !warns )
            warns = [];
        const [
            phoneNumbersById,
            extensions,
        ] = await Promise.all([
            this.ringCentral.getPhoneNumbers().then( phoneNumbers => {
                return phoneNumbers.reduce( (acc,phoneNumber) => {
                    if( !phoneNumber.extension ) {
                        warns?.push(`Phone number ${phoneNumber.phoneNumber} is not assigned to any extension, skipping`);
                        return acc;
                    }
                    if( !acc[phoneNumber.extension.id] )
                        acc[phoneNumber.extension.id] = [];
                    acc[phoneNumber.extension.id].push(phoneNumber);
                    return acc;
                },{} as Record<string,RingCentral.PhoneNumber[]>);
            }),
            this.ringCentral.getExtensions(['Enabled'],['User'])
        ]);
        const contacts = extensions.reduce( (acc,ext) => {
            const name    = ext.name || 
                (ext.contact ? ext.contact.firstName + " " + ext.contact.lastName : undefined) ||
                undefined;  
            if( !name ) {
                warns?.push(`Extension #${ext.id} (${name}) has no name, skipping`);
                return acc;
            }
            if( ext.status !== 'Enabled' ) {
                warns?.push(`Extension #${ext.id} (${name}) is not enabled (status=${ext.status}), skipping`);
                return acc;
            }
            if( ext.hidden ) {
                warns?.push(`Extension #${ext.id} (${name}) is hidden, skipping`);
                return acc;
            }
            const phoneNumbers  = phoneNumbersById[ext.id]||[];
            if( !phoneNumbers.length ) {
                warns?.push(`Extension #${ext.id} (${name}) has no phone numbers, skipping`);
                return acc;
            }
            acc.push({ 
                name,
                phoneNumbers    : phoneNumbers.map(pn=>pn.phoneNumber),
                emailAddresses  : ext.contact?.email ? [ext.contact.email] : [],
            });
            return acc;
        }, [] as Contact[] );
        //console.log(contacts.map(c=>`${c.name};${c.phoneNumbers.join(",")};${c.emailAddresses.join(",")}`).join("\n"))
        return contacts;
    }
}
