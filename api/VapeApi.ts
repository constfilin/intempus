import fetch                from 'node-fetch';
import { server }           from '../Server';
import * as misc            from '../misc';

export interface User {
    session_id      : string;
    flow?           : string;
    role?           : string;
    user?: {
        phone       : string;
        first_name  : string;
        last_name   : string;
    };
    verified        : boolean;
    match_status    : string;
    match_count     : number;
    candidates      : Array<Record<string,any>>;
    property_identified: boolean;
    property_scope_type: string;
    contact_name?   : string;
    contact_phone?  : string;
}

export interface FAQAnswer {
    session_id      : string;
    flow?           : string;
    role            : string;
    user?: {
        phone       : string;
        first_name  : string;
        last_name   : string;
    };
    verified        : boolean;
    reply           : string;
}

export interface TransferTarget {
    session_id      : string;
    verified        : boolean;
    contact_name    : (string|undefined);
    contact_phone   : (string|undefined);
}

const _callApi = async ( apiUrl:string, payload:Record<string,any> ): Promise<Record<string,any>> => {
    const init = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${server.config.vapeApi.token}`
        },
        body: JSON.stringify(payload)
    };
    server.moduleLog(
        module.filename,
        3,
        `Calling ${apiUrl} with`,
        payload
    );
    const response = await fetch(apiUrl, init);
    const carefullyGetResponseJson = async () : Promise<Record<string,any>> => {
        try {
            return (await response.json()) as Record<string,any>;
        }
        catch( err ) {
            return err as Record<string,any>;
        }
    }
    if (!response.ok)
        throw Error(`API Error (${response.status} ${response.statusText}): ${apiUrl}: ${JSON.stringify(await carefullyGetResponseJson())}`);
    return (await response.json()) as Record<string, any>;
};

export const getUserByPhone = async (sessionId: string, phoneNumber: string): Promise<User> => {
    const apiUrl= `https://api.insynergyapp.com/ai-voice-chat-user`;
    const resp  = await _callApi(
        apiUrl,
        {
            session_id  : sessionId,
            phone       : server.config.simulatedPhoneNumber || misc.canonicalizePhone(phoneNumber)
        }
    );
    if (resp.error || !resp.data || !resp.data.user || (!resp.data.verified && server.config.vapeApi.requireVerified) )
        throw Error(`User not found or not verified for phone number '${phoneNumber}': ${JSON.stringify(resp)}`);
    return resp.data;
};

export const getFAQAnswer = async ( sessionId:string, question:string ): Promise<FAQAnswer> => {
    const apiUrl = `https://api.insynergyapp.com/ai-voice-chat-message`;
    const resp = await _callApi(
        apiUrl,
        {
            session_id  : sessionId,
            text        : question
        }
    );
    if (resp.error || !resp.data || !resp.data.user || /*(!resp.data.verified && server.config.vapeApi.requireVerified) ||*/ !resp.data.reply)
        throw Error(`Cannot get FAQ answer for session '${sessionId}' on question '${question}': ${JSON.stringify(resp)}`);
    return resp.data;
};

export const getTransferTarget = async ( sessionId:string, propertyId:string ) : Promise<TransferTarget> => {
    const apiUrl = `https://api.insynergyapp.com/ai-voice-chat-transfer-target`;
    const resp = await _callApi(
        apiUrl,
        {
            session_id      : sessionId,
            property_or_hoa : propertyId
        }
    );
    if( resp.error || !resp.data || ((resp.data.contact_phone||'')=='') || (resp.data.session_id!==sessionId) )
        throw Error(`Cannot get transfer target for session '${sessionId}' with property '${propertyId}': ${JSON.stringify(resp)}`);
    return resp.data;
}