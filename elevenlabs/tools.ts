import { ElevenLabs }       from '@elevenlabs/elevenlabs-js';

import * as ELabsConsts     from './consts';
import * as Contacts        from '../Contacts';
import { server }           from '../Server';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const _getWebhookHeaders = () : Record<string,string> => {
    return {
        "X-Secret" : server.config.provider.toolSecret,
    };
};

const _getToolUrl = ( toolName:string ) : string => {
    return `${server.config.publicUrl}/tool/${toolName}`;
};

const _getToolCallSound = () : Partial<ElevenLabs.WebhookToolConfigInput> => {
    return {
        forcePreToolSpeech    : false,
        //pre_tool_speech       : "auto",
        toolCallSound         : "typing",
        toolCallSoundBehavior : "always",
        toolErrorHandlingMode : "auto",
    };
}
// ---------------------------------------------------------------------------
// Webhook tools  (server-side function calls)
// ---------------------------------------------------------------------------

/**
 * dispatchCall – look up a contact by name, check time-zone / business hours
 * and return dispatch instructions.
 */
export const getDispatchCall = ( contacts:Contacts.Contact[] ) : ElevenLabs.ToolRequestModel => {
    return {
        toolConfig : {
            type        : "webhook",
            name        : "dispatchCall",
            description : "API gets a person name, looks up spreadsheet contacts, checks current time and return instructions how to dispatch the call",
            responseTimeoutSecs : 30,
            ..._getToolCallSound(),
            apiSchema : {
                url     : _getToolUrl("dispatchCall"),
                method  : "POST",
                requestHeaders  : _getWebhookHeaders(),
                requestBodySchema : {
                    type        : "object",
                    properties  : {
                        name : {
                            type        : "string",
                            description : "The name of the person to dispatch the call to",
                            enum        : contacts.map(c => c.name),
                        },
                        phoneNumber: {
                            type            : "string",
                            dynamicVariable : "system__caller_id",
                        }
                    },
                    required : ["name","phoneNumber"]
                }
            }
        }
    };
};

/**
 * sendEmail – send an email to one of the known contacts.
 */
export const getSendEmail = ( contacts:Contacts.Contact[] ) : ElevenLabs.ToolRequestModel => {
    const toEnums : string[] = [];
    contacts.forEach( c => {
        if( c.emailAddresses[0] && !toEnums.includes(c.emailAddresses[0]) )
            toEnums.push(c.emailAddresses[0]);
    });
    return {
        toolConfig : {
            type        : "webhook",
            name        : "sendEmail",
            description : "Sending Email",
            responseTimeoutSecs : 30,
            ..._getToolCallSound(),
            apiSchema : {
                url     : _getToolUrl("sendEmail"),
                method  : "POST",
                requestHeaders  : _getWebhookHeaders(),
                requestBodySchema : {
                    type        : "object",
                    properties  : {
                        type : {
                            type        : "string",
                            constantValue : "sendEmail",
                        },
                        to : {
                            type        : "string",
                            description : "The email address",
                            enum        : toEnums,
                        },
                        text : {
                            type        : "string",
                            description : "The body of the email",
                        },
                        subject : {
                            type        : "string",
                            description : "The subject of the email",
                        }
                    },
                    required : ["type","to","text","subject"]
                }
            }
        }
    };
};

/**
 * guessState – attempt to determine the US state of the caller.
 */
export const getGuessState = ( /*contacts:Contacts.Contact[]*/ ) : ElevenLabs.ToolRequestModel => {
    return {
        toolConfig : {
            type        : "webhook",
            name        : "guessState",
            description : "Guess State of the Caller",
            responseTimeoutSecs : 30,
            ..._getToolCallSound(),
            apiSchema : {
                url     : _getToolUrl("guessState"),
                method  : "POST",
                requestHeaders  : _getWebhookHeaders(),
                requestBodySchema : {
                    type        : "object",
                    properties  : {
                        phoneNumber: {
                            type            : "string",
                            dynamicVariable : "system__caller_id",
                        }
                    },
                    required : ["phoneNumber"]
                },
            }
        }
    };
};

/**
 * getFAQAnswer – retrieve an FAQ answer for a question.
 */
export const getFAQAnswer = ( contacts:Contacts.Contact[] ) : ElevenLabs.ToolRequestModel => {
    return {
        toolConfig : {
            type        : "webhook",
            name        : "getFAQAnswer",
            description : "Get FAQ answer for the question",
            // 4/21/2026 Michael requested not to wait for the API longer than 3 seconds but 5 is the
            // minimum we can set in ElevenLabs right now.
            responseTimeoutSecs : 5,
            disableInterruptions: false,
            ..._getToolCallSound(),
            apiSchema : {
                url             : _getToolUrl("getFAQAnswer"),
                method          : "POST",
                requestHeaders  : _getWebhookHeaders(),
                requestBodySchema : {
                    type        : "object",
                    properties  : {
                        question : {
                            type            : "string",
                            description     : "The question asked by the caller",
                        },
                        sessionId: {
                            type            : "string",
                            dynamicVariable : "system__conversation_id",
                        }

                    },
                    required : ["question", "sessionId"]
                }
            }
        }
    };
};

export const getInstructionsByPhone = () : ElevenLabs.ToolRequestModel => {
    return {
        toolConfig : {
            type        : "webhook",
            name        : "getInstructionsByPhone",
            description : "Get next instructions based on user phone number",
            disableInterruptions  : true, // Potentially we have to make it inunrerruptable
            responseTimeoutSecs : 30,
            ..._getToolCallSound(),
            apiSchema : {
                url             : _getToolUrl("getInstructionsByPhone"),
                method          : "POST",
                requestHeaders  : _getWebhookHeaders(),
                requestBodySchema : {
                    type        : "object",
                    properties  : {
                        sessionId : {
                            type            : "string",
                            dynamicVariable : "system__conversation_id",
                        },
                        phoneNumber : {
                            type            : "string",
                            dynamicVariable : "system__caller_id",
                        }
                    },
                    required : ["sessionId","phoneNumber"]
                }
            },
            assignments : [{
                source          : "response",
                dynamicVariable : 'user_first_name',
                valuePath       : 'user_first_name',
                sanitize        : false
            },{
                source          : "response",
                dynamicVariable : 'user_last_name',
                valuePath       : 'user_last_name',
                sanitize        : false
            },{
                source          : "response",
                dynamicVariable : ELabsConsts.phoneTransferDestinationVarName,
                valuePath       : ELabsConsts.phoneTransferDestinationVarName,
                sanitize        : false
            }]
        }
    };
}

export const getTransferInstructions = () : ElevenLabs.ToolRequestModel => {
    return {
        toolConfig : {
            type                : "webhook",
            name                : "getTransferInstructions",
            description         : "Get instructions about what to do depending on the property identifier",
            responseTimeoutSecs : 5,
            disableInterruptions  : true, // Potentially we have to make it inunrerruptable
            ..._getToolCallSound(),
            apiSchema : {
                url             : _getToolUrl("getTransferInstructions"),
                method          : "POST",
                requestHeaders  : _getWebhookHeaders(),
                requestBodySchema : {
                    type        : "object",
                    properties  : {
                        sessionId: {
                            type            : "string",
                            dynamicVariable : "system__conversation_id",
                            //description     : "user session identifier"
                        },
                        propertyId : {
                            type            : "string",
                            description     : "Optional identifier of the property. Could be a street address, a name of the apartment complex, etc",
                        },
                        sectionName : {
                            type            : "string",
                            description     : "Optional value indicating that the caller wants to transfer to a specific section"
                        }   
                    },
                    // If `propertyId` is not passed then the backend API uses
                    // information that was stored in the session earlier.
                    required : ["sessionId"]
                },
            },
            assignments : [{
                source          : "response",
                dynamicVariable : ELabsConsts.phoneTransferDestinationVarName,
                valuePath       : ELabsConsts.phoneTransferDestinationVarName,
                sanitize        : false
            }]
        }
    };  
}
