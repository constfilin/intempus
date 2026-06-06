import { SDK as RCSDK } from '@ringcentral/sdk';
import { server } from './Server';

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

const _getRC = <T extends {}>( 
    platform    : ReturnType<RCSDK['platform']>, 
    context     : {
        timeoutMs : number;
        count?       : number;
    },
    url         : string, 
    query       : Record<string,any>
) : Promise<T> => {
    const retryableErrorMessages = [
        "Request rate exceeded",
        "429 Too Many Requests"
    ];
    context.count = (context.count||0)+1;
    return platform.get(url,query)
        .then( res => {
            return res.json();
        })
        .then( json => {
            server.moduleLog(module.filename,1,`Got from '${url}'`,json);
            return json as T;
        })
        .catch( err => {
            if( !retryableErrorMessages.includes(err.message) )
                throw Error(`Cannot call ${url} (${err.message})`);
            // Do a random wait and repeat
            server.moduleLog(module.filename,3,`Got err '${err.message}' from '${url}', will re-try after ${context.timeoutMs}ms, count is ${context.count}`);
            return (new Promise((resolve)=>setTimeout(resolve,context.timeoutMs))).then(() => {
                // Do exponential backoff
                context.timeoutMs = 2*context.timeoutMs+Math.random()*5000;
                return _getRC(platform,context,url,query);
            })
        });
}
const _paginateRecords = async <T extends { records:any[], paging:Paging }>(
    platform : ReturnType<RCSDK['platform']>,
    context  : {
        timeoutMs : number,
        count?    : number
    },
    url      : string,
    query    : Record<string,any>
) => {
    const result = {
        records : []
    } as unknown as T;
    for( let pageNdx=1; pageNdx<100; pageNdx++ ) {
        const page = (await _getRC<T>(platform,context,url,{page:pageNdx}));
        result.records.push(...page.records);
        if( result.records.length>=page.paging.totalElements )
            break;
        server.moduleLog(module.filename,2,`Got ${result.records.length} records of '${url}, total records is ${page.paging.totalElements}, going to page #${pageNdx+1}`)
    }
    return result;

}

export const login = async ( config: {
    clientId        : string;
    clientSecret    : string;
    jwt             : string;
    server          : string;
} ) : Promise<ReturnType<RCSDK['platform']>> => {
    try {
        const sdk      = new RCSDK(config);
        const platform = sdk.platform();
        await platform.login(config);
        return platform;
    }
    catch( err ) {
        throw Error(`Failed to login to RingCentral platform: ${err}`);
    }
}


export const getPhoneNumbers = async <T extends Object> ( 
    platform:ReturnType<RCSDK['platform']> 
) : Promise<PhoneNumber[]> => {
    try {
        const result = await _paginateRecords<PhoneNumbersResult>(platform,{timeoutMs:Math.random()*1000},"/restapi/v2/accounts/~/phone-numbers",{});
        return result.records||[];
    }
    catch( err ) {
        throw Error(`Failed to get phone numbers from RingCentral: ${err}`);
    }
}
export const getExtensions = async ( 
    platform:ReturnType<RCSDK['platform']>,
    statusFilter? : string[],
    typeFilter? : string[]
) : Promise<Extension[]> => {
    try {
        // TODO:
        // Support status and type filters
        const result = await _paginateRecords<ExtensionsResult>(platform,{timeoutMs:Math.random()*1000},"/restapi/v1.0/account/~/extension",{});
        return result.records||[];
    }
    catch( err ) {
        throw Error(`Failed to get extensions from RingCentral: ${err}`);
    }
}
export const getExtensionDetails = async ( 
    platform:ReturnType<RCSDK['platform']>, 
    extensionId:string 
) : Promise<ExtensionDetails> => {
    try {
        return (await _getRC(platform,{timeoutMs:Math.random()*1000},`/restapi/v1.0/account/~/extension/${extensionId}`,{})) as ExtensionDetails;
    }
    catch( err ) {
        throw Error(`Failed to get defails of extension #${extensionId} from RingCentral: ${err}`);
    }
}
export const getExtensionDetailsList = async ( 
    platform:ReturnType<RCSDK['platform']>, 
    extensionIds:string[] 
) : Promise<ExtensionDetails[]> => {
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
        const batchResults = await Promise.all(batch.map(id=>getExtensionDetails(platform,id)));
        results.push(...batchResults);
    }
    return results;
}