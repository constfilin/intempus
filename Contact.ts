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

export default Contact;