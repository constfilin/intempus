import * as misc                from './misc';
import { server }               from './Server';

export interface Contact {
    name                : string;
    description         : (string|undefined);
    timeZone            : (string|undefined);
    phoneNumbers        : string[];
    emailAddresses      : string[];
    businessStartHour   : number;
    businessEndHour     : number;
    vmPrompt?           : string;
}

export const getSheet = async ( apiKey:string, docId:string, sheetName:string ) : Promise<GoogleSpreadsheet.GoogleSpreadsheetWorksheet|undefined> => {
    if( !docId )
        throw Error(`docId is not provided`);
    const jwt = new JWT({
        //email   : auth.client_email,
        //key     : auth.private_key,
        apiKey,
        scopes  : [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.file',
        ]
    });
    const doc = new GoogleSpreadsheet.GoogleSpreadsheet(docId,jwt);
    await doc.loadInfo();
    sheetName = sheetName.toLowerCase();
    return doc.sheetsByIndex.find(ws => {
        return ws.title.toLowerCase()===sheetName;
    });
}

export const getFromRows = ( 
    rows    : (GoogleSpreadsheet.GoogleSpreadsheetRow<Record<string,any>>[]),
    warns?  : string[]
) => {
    if( !warns )
        warns = [];
    return rows.reduce( (acc,r,ndx)  => {
        const name = r.get("Name");
        if( typeof name != 'string' ) {
            warns.push(`Name is missing in row #${ndx}`);
            return acc;
        }
        const phones = r.get("PhoneNumber")||'';
        // Separate the phone numbers by ;, space or new lines
        const phoneNumbers = phones.split(/[;,\s\n\r]/).map(misc.canonicalizePhone);
        if( phoneNumbers.length<1 || (phoneNumbers[0]?.length||0)<1 ) {
            warns.push(`Found '${name}' in row #${ndx} not having a phone. Skipping...`);
            return acc;
        }
        const emails = r.get("EmailAddresses")||'';
        const emailAddresses = emails.split(/[;,\s\n\r]/).map(misc.canonicalizeEmail);
        acc.push({
            name                : misc.canonicalizePersonName(name),
            description         : r.get("Description"),
            timeZone            : r.get("TimeZone"),
            phoneNumbers,
            emailAddresses,
            businessStartHour   : misc.toNumber(r.get("Business Start Hour"),server.config.contacts.businessStartHour??8),
            businessEndHour     : misc.toNumber(r.get("Business End Hour"),server.config.contacts.businessEndHour??17),
            vmPrompt            : r.get("VM Prompt"),
        });
        return acc;
    },[] as Contact[]);
}

export const getFromSheet = async ( sheet:GoogleSpreadsheet.GoogleSpreadsheetWorksheet, warns?:string[] ) : Promise<Contact[]> => {
    if( !warns )
        warns = [];
    return sheet.getRows().then( rows => {
        return getFromRows(rows,warns);
    });
}
