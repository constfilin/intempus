import { SDK as RCSDK } from '@ringcentral/sdk';
import { server } from './Server';
import { models } from '@elevenlabs/elevenlabs-js/api';

export interface Paging {
    page            : number;
    totalPages      : number;
    perPage         : number;
    totalElements   : number;
    pageStart       : number;
    pageEnd         : number;
}
export interface PhoneNumber {
    id              : string;
    phoneNumber     : string;
    tollType        : string;
    usageType       : string;
    status          : string;
    extension : {
        id          : string;
        extensionNumber : string;
    };
    callerIdName    : string;
    mobileNumber    : boolean;
}
export interface Extension {
    url             : string;
    id              : number;
    extensionNumber : string;
    contact         : {
        firstName   : string;
        lastName    : string;
        email       : string;
        businessPhone : string;
        pronouncedName : {
            type       : string;
            text       : string;
            prompt     : Record<string,any>;
        }
        roles       : Record<string,any>[];
        mobilePhone : string;
    };
    name            : string;
    type            : string;
    status          : string;
    permissions     : Record<string,any>;
    profileImage    : {
        uri         : string;
    };
    hidden          : boolean;
    assignedCountry : {
        uri         : string;
        id          : string;
        name        : string;
        isoCode     : string;
    },
    creationTime    : string;
};
export interface ExtensionDetails extends Extension {
    regionalSettings : {
        timezone : {
            uri        : string;
            id         : string;
            name       : string;
            description: string;
            bias       : string;
        };
        homeCountry      : Record<string,any>;
        language         : Record<string,any>;
        greetingLanguage : Record<string,any>;
        formattingLocale : Record<string,any>;
    };
}
export interface PhoneNumbersResult {
    records         : PhoneNumber[];
    paging          : Paging;
}
export interface ExtensionsResult {
    id              : string;
    records         : Extension[];
    paging          : Paging;
    navigation      : {
        firstPage   : {
            uri     : string;
        };
        lastPage    : {
            uri     : string;
        };
    };
}

export class RingCentral {

    private apiCallRateMs   : number;
    private platform        : ReturnType<RCSDK['platform']>;
    private lastApiCallMs   : number = 0;

    private waitApi() : Promise<void> {
        // See https://developers.ringcentral.com/guide/basics/rate-limits
        return new Promise((resolve) => {
            const waitMs = (this.lastApiCallMs+this.apiCallRateMs)-Date.now();
            if( waitMs<0 )
                resolve();
            else 
                setTimeout(resolve,waitMs);
        });
    }
    private callApi<T extends {}>( 
        url         : string, 
        query       : Record<string,any>
    ) : Promise<T> {
        const retryableErrorMessages = [
            "Request rate exceeded",
            "429 Too Many Requests"
        ];
        const x_rate_limit_remaining_header = "x-rate-limit-remaining";
        return this.waitApi()
            .then(()=>{
                return this.platform.get(url,query).finally(()=>{
                    this.lastApiCallMs = Date.now();
                });
            })
            .then( res => {
               return res.json();
            })
            .then( json => {
                server.moduleLog(module.filename,3,`Got from '${url}', resetting call rate`);
                this.apiCallRateMs = this.config.apiCallRateMs;
                return json as T;
            })
            .catch( err => {
                if( !retryableErrorMessages.includes(err.message) )
                    throw Error(`Cannot call ${url} (${err.message})`);
                // Do a random wait with exponential back-off
                this.apiCallRateMs = Math.min(60000+(5*Math.random()),this.apiCallRateMs*(1.5+Math.random()));
                server.moduleLog(module.filename,3,`Got err '${err.message}' from '${url}', will re-try after ${this.apiCallRateMs}ms`);
                return this.callApi(url,query);
            });
    }
    private async paginateRecords<T extends { records:any[], paging:Paging }>(
        url      : string,
        query    : Record<string,any>
    ) {
        const result = {
            records : []
        } as unknown as T;
        for( let pageNdx=1; pageNdx<100; pageNdx++ ) {
            const page = (await this.callApi<T>(url,Object.assign(query,{page:pageNdx})));
            result.records.push(...page.records);
            if( result.records.length>=page.paging.totalElements )
                break;
            server.moduleLog(module.filename,2,`Got ${result.records.length} records of '${url}, total records is ${page.paging.totalElements}, going to page #${pageNdx+1}`)
        }
        return result;
    }

    constructor( private config: {
        clientId        : string;
        clientSecret    : string;
        jwt             : string;
        server          : string;
        apiCallRateMs   : number
    } ) {
        this.config   = config;
        this.apiCallRateMs = config.apiCallRateMs;
        this.platform = (new RCSDK(this.config)).platform();
    }
    async login() : Promise<void> {
        try {
            await this.platform.login(this.config);
        }
        catch( err ) {
            throw Error(`Failed to login to RingCentral platform: ${err}`);
        }
    }
    async getPhoneNumbers() : Promise<PhoneNumber[]> {
        try {
            const result = await this.paginateRecords<PhoneNumbersResult>("/restapi/v2/accounts/~/phone-numbers",{});
            return result.records||[];
        }
        catch( err ) {
            throw Error(`Failed to get phone numbers from RingCentral: ${err}`);
        }
    }
    async getExtensions( statusFilter? : string[], typeFilter? : string[] ) : Promise<Extension[]> {
        try {
            // TODO:
            // Support status and type filters
            const result = await this.paginateRecords<ExtensionsResult>("/restapi/v1.0/account/~/extension",{});
            return result.records||[];
        }
        catch( err ) {
            throw Error(`Failed to get extensions from RingCentral: ${err}`);
        }
    }
    async getExtensionDetails( extensionId:string ) : Promise<ExtensionDetails> {
        try {
            return (await this.callApi(`/restapi/v1.0/account/~/extension/${extensionId}`,{})) as ExtensionDetails;
        }
        catch( err ) {
            throw Error(`Failed to get defails of extension #${extensionId} from RingCentral: ${err}`);
        }
    }
    async getExtensionDetailsList( extensionIds:string[] ) : Promise<ExtensionDetails[]> {
        const results = [] as ExtensionDetails[];
        const maxBatchLength = 10;
        const batches = extensionIds.reduce((acc,extId) => {
            let batch = acc.at(-1);
            if( !batch || batch.length>=maxBatchLength ) {
                batch = [];
                acc.push(batch);
            }
            batch.push(extId);
            return acc;
        },[] as string[][]);
        for( const batch of batches ) {
            const batchResults = await Promise.all(batch.map(id=>this.getExtensionDetails(id)));
            results.push(...batchResults);
        }
        return results;
    }
}