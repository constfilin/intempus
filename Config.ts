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
    loglevel                : number;
    path                    : string;
    providerType            : 'vapi'|'elevenLabs';
    vapi?                   : Vapi;
    elevenLabs?             : ElevenLabs;
    publicUrl               : string;
    replPort                : number;
    open_ws                 : boolean;
    simulatedPhoneNumber    : string;
    notificationEmailAddress: string;
    contacts:               {
        // For RingCentral integration        
        rc : {
            clientId        : string;
            clientSecret    : string;
            jwt             : string;
            server          : string;
        }
        // defaults
        businessStartHour?  : number;
        businessEndHour?    : number;
    }
    vapeApi                 : {
        token               : string;
        timeoutSec          : number;
        banPeriodSec        : number;
        requireVerified?    : boolean;
    };
    web                     :   {
        port                :   number;
        header_name         :   string;
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

        if( !params.vapeApi )
            throw Error(`No vapeApi configuration provided`);
        if( !params.vapeApi.token )
            throw Error(`No vapeApi token provided`);

        if( !params.nm )
            throw Error(`No nodemailer configuration`);

        // Default values
        this.loglevel       = 1;
        this.path           = __dirname;
        this.providerType   = 'elevenLabs';
        this.open_ws        = false;
        this.simulatedPhoneNumber = '+15555555555';
        this.notificationEmailAddress = '';
        this.publicUrl      = 'http://localhost';
        this.replPort       = 0;    // Off by default, can be enabled by setting to a non-zero value
        this.vapeApi  = {
            token         : '',
            timeoutSec    : 10,
            banPeriodSec  : 60
        };
        
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

export default Config;