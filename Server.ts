import util                     from 'node:util';
import net                      from 'node:net';
import repl                     from 'node:repl';

import * as GoogleSpreadsheet   from 'google-spreadsheet';
import nodemailer               from 'nodemailer';
import * as ws                  from 'ws';

import dayjs                    from './day-timezone';
import * as Config              from './Config';
import * as Contacts            from './Contacts';
import { ElevenLabsApi }        from './ElevenLabsApi';

export let server = {} as Server;

export default class Server {

    module_log_level        : Record<string,number> = {};
    config                  : Config.Config;
    contacts_sheet          : (GoogleSpreadsheet.GoogleSpreadsheetWorksheet|undefined);
    nm_transport            : (nodemailer.Transporter|undefined);
    ws_by_url               : Record<string,ws.WebSocket>; 
    elevenLabsApi           : ElevenLabsApi;
    ban_vape_api_until_date?: Date;

    constructor() {
        this.config         = Config.get();
        this.contacts_sheet = undefined; // Let's do it at the very first request
        this.nm_transport   = nodemailer.createTransport(this.config.nm);
        this.ws_by_url      = {};
        this.elevenLabsApi  = new ElevenLabsApi();
        this.init_repl();
        server = this;
        return this;
    }
    init_repl() {
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
    log_prefix( level:number ) {
        return `${dayjs().format("YYYY-MM-DD HH:mm:ss")}:${level}`;
    }
    log( level:number, ...args:any[] ) {
        if( this.config.web.loglevel >= level ) {
            // tslint:disable:no-console
            console.log(`${this.log_prefix(level)}: ` + util.format(...args));
        }
        return this;
    }
    module_log( filename:string, level:number, ...args:any[] ) {
        const modname  = (filename.startsWith(this.config.web.path) ? filename.substring(this.config.web.path.length) : filename).replace(/^.*\/([^/\.]+)\.[^\.]+$/,"$1");
        const loglevel = (modname in this.module_log_level) ? this.module_log_level[modname] : this.config.web.loglevel;
        if( loglevel>=level ) {
            // tslint:disable:no-console
            console.log(`${this.log_prefix(level)}: ` + util.format(modname,...args));
        }
        return this;
    }    
    sendEmail(args:{ to:string, subject:string, text:string }) : Promise<void> {
        if( !this.nm_transport )
            throw Error(`Transport is not initialized`);
        return this.nm_transport.sendMail({
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
    async getContacts() : Promise<Contacts.Contact[]> {
        if( !this.contacts_sheet ) {
            this.contacts_sheet = await Contacts.getSheet(this.config.googleApiKey,this.config.spreadsheetId,this.config.worksheetName);
            if( !this.contacts_sheet )
                throw Error(`Cannot find sheet '${this.config.worksheetName}' in ${this.config.spreadsheetId}`);
        }
        return this.contacts_sheet.getRows().then( rows => {
            return Contacts.getFromRows(rows);
        });
    }
}
