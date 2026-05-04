export interface Vapi {
    apiKey             : string;
    toolSecret         : string;
    model              : string;
    modelProvider      : string;
    orgId              : string;
};
export interface ElevenLabs {
    apiKey             : string;
    toolSecret         : string;
    model              : string;
    workspaceId        : string;
    summarySecret      : string;
    voiceId            : string;
};
export class Config {
    // common params
    spreadsheetId           : string;
    googleApiKey            : string;
    worksheetName           : string;
    providerType            : 'vapi'|'elevenLabs';
    vapi?                   : Vapi;
    elevenLabs?             : ElevenLabs;
    publicUrl               : string;
    replPort                : number;
    open_ws                 : boolean;
    simulatedPhoneNumber    : string;
    notificationEmailAddress: string;
    vapeApi                 : {
        token               : string;
        timeoutSec          : number;
        banPeriodSec        : number;
        requireVerified?    : boolean;
    };
    web                     :   {
        path                :   string;
        loglevel            :   number;
        port                :   number;
        header_name         :   string;
        business_start_hour?:   number;
        business_end_hour?  :   number;
    };
    nm                      :   {
        from                : string;
        host                : string;
        secure              : boolean;
        port                : number;
        tls                 : {
            ciphers         : string;
            rejectUnauthorized : boolean;
        };
        auth                : { 
            user            : string;
            pass            : string;
        }
    };
    constructor( params:Config ) {

        if( !params )
            throw Error(`Config is not provided`);
        if( params.providerType === 'vapi' && params.vapi ) {
            // valid
        }
        else if( params.providerType === 'elevenLabs' && params.elevenLabs ) {
            // valid
        }
        else {
            throw Error(`Provider type is set to ${params.providerType} but configuration is not provided`);
        }

        if( !params.web )
            throw Error(`No web configuration provided`);
        if( !params.web.header_name || !(params.vapi?.toolSecret||params.elevenLabs?.toolSecret) )
            throw Error(`Authentication is not provided`);
        if( typeof params.web.port !== 'number' )
            throw Error('Port is not provided'); 
        if( typeof params.web.loglevel !== 'number' )
            params.web.loglevel = 1;

        if( !params.vapeApi )
            throw Error(`No vapeApi configuration provided`);
        if( !params.vapeApi.token )
            throw Error(`No vapeApi token provided`);
        if( typeof params.vapeApi.timeoutSec !== 'number' )
            params.vapeApi.timeoutSec = 10;
        if( typeof params.vapeApi.banPeriodSec !== 'number' )
            params.vapeApi.banPeriodSec = 60;

        if( !params.nm )
            throw Error(`No nodemailer configuration`);

        Object.assign(this,params);
    }
    get provider() : (Vapi|ElevenLabs) {
        if( this.providerType === 'vapi' )
            return this.vapi!;
        else if( this.providerType === 'elevenLabs' )
            return this.elevenLabs!;
        else
            throw Error(`Invalid provider type ${this.providerType}`);
    }
}

let _config = undefined as (Config|undefined);

export const get = () : Config => {
    if( !_config ) 
        _config = new Config(require('./config.js').default);
    return _config!;
}

export default Config;