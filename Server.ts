import util                     from 'node:util';
import net                      from 'node:net';
import repl                     from 'node:repl';

import { SDK as RCSDK }         from '@ringcentral/sdk';
import nodemailer               from 'nodemailer';
import * as ws                  from 'ws';

import dayjs                    from './day-timezone';
import Config                   from './Config';
import * as Contacts            from './Contacts';
import { ElevenLabsApi }        from './ElevenLabsApi';

export interface RCExtension {

}

export let server = {} as Server;

export default class Server {
    //
    config                  : Readonly<Config>;
    ringCentral             : {
        platform            : ReturnType<RCSDK['platform']>;
        extensionsDetails?  : Record<string,RCExtension>;
    };
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
        this.ringCentral    = {
            platform     : {} as ReturnType<RCSDK['platform']>  // get initialized in init()
        };
        this.initREPL();
        return this;
    }
    async init() : Promise<Server> {
        this.ringCentral = await this.initRingCentral();
        this.moduleLog(module.filename,1,`Server initialized with provider ${this.config.providerType}`);
        return this;
    }
    private async initRingCentral() {
        try {
            const sdk      = new RCSDK(this.config.contacts.rc);
            const platform = sdk.platform();
            await platform.login(this.config.contacts.rc);
            this.moduleLog(module.filename,1,`Successfully logged in to RingCentral platform with clientId=${this.config.contacts.rc.clientId}`);
            return {
                platform,
            };
        } 
        catch( e ) {
            throw Error(`Failed to initialize RingCentral platform: ${e}`);
        }
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
    async getContacts( warns?: string[] ) : Promise<Contacts.Contact[]> {
        console.log({
            'this.ringCentral': this.ringCentral,
        })
        const [
            phoneNumbers,
            { 
                extensionList,
                extensionDetails,
            }
        ] = await Promise.all([
            this.ringCentral.platform.get("/restapi/v2/accounts/~/phone-numbers",{})
                .then( res => res.json() )
                .catch( err => {
                    throw Error(`Failed to get phone numbers from RingCentral: ${err}`);
                }),
            this.ringCentral.platform.get("/restapi/v1.0/account/~/extension",{})
                .then( res => res.json() )
                .then( extensionList => {
                    // If extension details are available in the cache, use them
                    if( this.ringCentral.extensionsDetails )
                        return {
                            extensionList,
                            extensionDetails : this.ringCentral.extensionsDetails 
                        };
                    // Have to do this the hard way
                    return Promise.all(
                        (extensionList.records||[]).map( (ext:Record<string,any>) => {
                            return this.ringCentral.platform.get(`/restapi/v1.0/account/~/extension/${ext.id}`,{})
                                .then( res => res.json() )
                                .catch( err => {
                                    throw Error(`Failed to get extension details from RingCentral: ${err}`);
                                });
                        })
                    ).then( extensionDetails => {
                        return {
                            extensionList,
                            extensionDetails : extensionDetails.reduce( (acc,details) => {
                                acc[details.id] = details;
                                return acc;
                            },{} as Record<string,RCExtension>)
                        }
                    });
                })
                .catch( err => {
                    throw Error(`Failed to get extensions from RingCentral: ${err}`);
                })
            ]);
        console.log({
            phoneNumbers,
            extensionList,
            extensionDetails,
        })
        throw Error(`Not implemented yet: need to correlate phone numbers with extensions to get the contacts list`);
    }
}
