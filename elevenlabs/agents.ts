import { ElevenLabs } from '@elevenlabs/elevenlabs-js';

import * as Config              from '../Config';
import * as Contacts            from '../Contacts';

import * as elevenLabsConsts    from './consts';
import * as tools               from './tools';
import { TestRunMetadataTestType } from '@elevenlabs/elevenlabs-js/api';
import { get } from 'node:http';

////////////////////////////////////////////////////////////////////////////////
// helpers
///////////////////////////////////////////////////////////////////////////////
const _joinSteps = ( steps:string[] ) : string => {
    if( steps.length === 0 )
        throw Error("steps is empty");
    if( steps.length === 1 )
        return steps[0];
    return steps.map((s,ndx) => {
        return `${ndx+1}. ${s}`;
    }).join("\n");
};
const _getToolIds = ( toolsByName: Record<string,ElevenLabs.Tool>, toolNames:string[] ) : string[] => {
    return toolNames.map(name => {
        const tool = toolsByName[name];
        if( !tool )
            throw Error(`Tool ${name} not found`);
        return tool.id;
    });
};
const _getAgentIds = ( agentsByName: Record<string,any>, agentNames:string[] ) : {name:string, id:string}[] => {
    return agentNames.map(name => {
        const agent = agentsByName[name];
        if( !agent )
            throw Error(`Agent ${name} not found`);
        return { name, id: agent.agentId };
    });
};
const _getAsrKeywords = ( contacts:Contacts.Contact[] ) : string[] => {
    const keywords = Object.values(contacts
        .map(c => c.name.split(/\s+/))
        .flat()
        .reduce((acc,n) => {
            n = n.replace(/[^a-zA-Z]/g,'');
            const lower = n.toLowerCase();
            if( ["a","an","the","for","to","oncall","in","by","of","main","hoa"].includes(lower) )
                return acc;
            acc[lower] = n;
            return acc;
        },{} as Record<string,string>));
    return [
        ...keywords,
        "H-O-A",
        "Maintenance",
        "Property",
        "Realty",
        "Intempus",
    ];
};
/**
 * redirectCall – transfer the call to a phone number (group extension or
 * individual contact).
 *
 * Maps from the Vapi `transferCall` tool type to ElevenLabs `transfer_to_number`
 * system tool.
 */
const _getGroupExtensionTransfers = () : ElevenLabs.PhoneNumberTransfer[] => {
    return Object.entries(elevenLabsConsts.groupExtensions).reduce( (transfers,[name,number]) => {
        if( !transfers.some(t => t.phoneNumber === number) ) {
            transfers.push({
                phoneNumber     : number,
                condition       : `Transfer the call when the caller needs ${name}`,
                transferType    : "blind",
            });
        }
        return transfers;
    },[] as ElevenLabs.PhoneNumberTransfer[]);
}
const _getContactTransfers = ( contacts:Contacts.Contact[] ) : ElevenLabs.PhoneNumberTransfer[] => {
    return contacts.reduce( (transfers,c) => {
        const fullPhone = `+1${c.phoneNumbers[0]}`;
        if( !transfers.some(t => t.phoneNumber === fullPhone) ) {
            transfers.push({
                phoneNumber     : fullPhone,
                condition       : c.description
                    ? `Transfer the call to ${c.name} - ${c.description}`
                    : `Transfer the call to ${c.name}`,
                transferType    : "conference",
            });
        }
        return transfers;
    },[] as ElevenLabs.PhoneNumberTransfer[]);
}
const _getSystemToolConfigOutput = ( transfers:ElevenLabs.PhoneNumberTransfer[] ) : ElevenLabs.SystemToolConfigOutput => {
    return {
        type        : "system",
        name        : "transfer_to_number",
        description : "Use this function to transfer the call to various contacts across different departments",
        params : {
            systemToolType : "transfer_to_number",
            transfers
        }
    };
}

/**
 * handoffToAssistant – hand the conversation off to another ElevenLabs agent.
 *
 * Maps from the Vapi `handoff` tool type to ElevenLabs `transfer_to_agent`
 * system tool.
 *
 * @param agents - array of {name, id} for every agent the current agent can
 *                 hand off to.  `id` must be the ElevenLabs agent id.
 */
const _getTransferToAgent = ( agents:{name:string, id:string}[] ) : ElevenLabs.SystemToolConfigOutput => {
    const transfers : ElevenLabs.AgentTransfer[] = agents.map( a => ({
        agentId     : a.id,
        condition   : `Transfer the call to the ${a.name} assistant`,
    }));
    return {
        type        : "system",
        name        : "transfer_to_agent",
        description : "Hand off the conversation to another assistant",
        params : {
            systemToolType : "transfer_to_agent",
            transfers,
        }
    };
};

type CreateAgentRequest = ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost;

const _completeAgent = (
    agent : Partial<ElevenLabs.GetAgentResponseModel>,
) : CreateAgentRequest => {
    // Build a complete ElevenLabs agent config from partial overrides.
    // This is the ElevenLabs counterpart of intempus/assistants.ts `_completeAssistant`.
    const config = Config.get();
    return {
        name                : agent.name,
        conversationConfig  : {
            agent: {
                firstMessage: agent.conversationConfig?.agent?.firstMessage,
                language    : agent.conversationConfig?.agent?.language ?? "en",
                prompt: {
                    prompt      : agent.conversationConfig?.agent?.prompt?.prompt,
                    llm         : config.elevenLabs!.model as ElevenLabs.Llm,
                    temperature : 0.3,
                    maxTokens   : 300,
                    toolIds     : agent.conversationConfig?.agent?.prompt?.toolIds,
                    builtInTools: agent.conversationConfig?.agent?.prompt?.builtInTools,
                    ignoreDefaultPersonality: true,
                },
            },
            tts: {
                voiceId: config.elevenLabs!.voiceId,
                expressiveMode: true
            },
            ...(agent.conversationConfig?.asr ? { asr: agent.conversationConfig.asr } : {}),
            ...(agent.conversationConfig?.languagePresets ? { languagePresets: agent.conversationConfig.languagePresets } : {}),
            ...(agent.conversationConfig?.turn ? { turn: agent.conversationConfig.turn } : {})
        },
    };
};

const getKeywordActionTable = () : string => {
    return `| Indent Keywords to Listen For | Action to Take |
        | :--- | :--- |
        | Leasing, Rentals | Tell "Forwarding to leasing" and forward the call to ${elevenLabsConsts.groupExtensions['Leasing Group']} |
        | Maintenance, Repair | Tell "Forwarding to maintenance" and forward the call to ${elevenLabsConsts.groupExtensions['Maintenance']} |
        | Emergency | Tell "Forwarding to emergency line" and forward the call to ${elevenLabsConsts.groupExtensions['Emergency']} |
        | Finance, Accounting, Payments, Accounts Payable, Account Receivable | Tell "Forwarding to finance" and forward the call to ${elevenLabsConsts.groupExtensions['Finance']} |
        | Operator, Representative, Customer Service | Clarify which department the caller wants to speak to (leasing/maintenance/finance/etc) and route the call to that department |
        | Property Manager | Tell "Forwarding to property management" and forward the call to "Intempus PropertyOwner" agent |
        | Sales | Tell "Forwarding to sales" and forward the call to ${elevenLabsConsts.groupExtensions['Sales']} |`;
}
// ---------------------------------------------------------------------------
// Assistants (agents)
// ---------------------------------------------------------------------------

export const getMain = (
    contacts    : Contacts.Contact[],
    toolsByName : Record<string,ElevenLabs.Tool>,
    agentsByName? : Record<string,any>,
) : CreateAgentRequest => {
    // Please note that the system prompt for "Intempus Main" get dynamically overwritten in pre-call handler. See api/index.ts for details. 
    // The dynamic part is the section that handles the case when we can identify the user by their phone number and get their first name. 
    // In that case we want to personalize the first message with their name and provide them with a more friendly greeting.
    return _completeAgent(
        {
            name         : "Intempus Main",
            conversationConfig : {
                agent : {
                    firstMessage : "",
                    prompt : {
                        prompt : `<TASKS>
${_joinSteps([
    `Pretend that the user said "Hello" and call the "dispatchUserByPhone" tool, wait for result`,
    `If "dispatchUserByPhone" tool returns a user proceed with next instruction, otherwise redirect the caller to the "Intempus Introduction" agent`,
    `If tool returned a user, then:
        * Monitor the caller's speech for the keywords mentioned in KEYWORDS_AND_ACTIONS section. If at any point during the call (even if you are in the middle of a speech) the caller mentions a keyword defined in the KEYWORDS_AND_ACTIONS section then stop the script immediately and execute the action of the keyword. 
        * When user asks a question call "getFAQAnswer" tool with the question asked by the user to get the answer from the FAQ database.
            - If "getFAQAnswer" tool fails or returns an err or returns an unhelpful reply or suggests the user to contact Intempus support, then do not attempt to provide your own answer, do not mention the error. Instead immediately follow the steps in CONNECTING_WITH_INTEMPUS section.
            - If "getFAQAnswer" tool returns a helpful answer, then provide the answer to the user and ask if they have any other questions.
            - Ask the user if it has another question and repeat this process until user hangs up or says that it wants to end the call.`
])}
</TASKS>
${elevenLabsConsts.systemPromptHeader}

<KEYWORDS_AND_ACTIONS>
${getKeywordActionTable()}
</KEYWORDS_AND_ACTIONS>

<CONNECTING_WITH_INTEMPUS>
- DO NOT invent or provide your own answer on the user's question.
- DO NOT ask follow-up questions.
- IMMEDIATELY say "I will need to connect you with a representative for that. Which department would you like to speak with?"
${[
    ...Object.entries(elevenLabsConsts.groupExtensions).map(([key, value]) => {
        return `- If the user wants to speak with ${key} then transfer the call to ${value}`;
    }),
    "- Otherwise say 'Transferring you to our dial-by-name directory' and transfer the call to the 'Intempus DialByName' agent",
].join("\n")}
</CONNECTING_WITH_INTEMPUS>

${elevenLabsConsts.systemPromptFooter}`,
                        toolIds     : _getToolIds(toolsByName,['dispatchCall','dispatchUserByPhone','getFAQAnswer']),
                        builtInTools: {
                            // "Intempus Main" transfers only to "Intempus Introduction"
                            transferToAgent: _getTransferToAgent(_getAgentIds(agentsByName||{},['Intempus Introduction'])),
                            transferToNumber: _getSystemToolConfigOutput(_getGroupExtensionTransfers())
                        },
                    }
                },
                languagePresets : {
                    es: {
                        overrides: {
                            agent: {
                                firstMessage: "Hola, soy Emily, una asistente de IA para Intempus Realty. ¿Eres un cliente de Intempus Realty?",
                            }
                        }
                    }
                },
                asr: {
                    keywords: _getAsrKeywords(contacts),
                },
                turn : {
                    turnTimeout : 4,
                    initialWaitTime : 1
                }
            },
            platformSettings : {
                overrides : {
                    conversationConfigOverride : {
                        turn : {
                            softTimeoutConfig : {
                                message : true
                            }
                        },
                        agent : {
                            firstMessage : true,
                            prompt : {
                                prompt : true,
                                llm : false,
                            }
                        }
                    },
                    enableConversationInitiationClientDataFromWebhook : true,
                },
            }
        }
    );
};

export const getUnkIntroduction = (
    contacts    : Contacts.Contact[],
    toolsByName : Record<string,ElevenLabs.Tool>,
    agentsByName? : Record<string,any>,
) : CreateAgentRequest => {
    return _completeAgent(
        {
            name         : "Intempus Introduction",
            conversationConfig : {
                agent : {
                    firstMessage : "You've reached the Intempus Realty Main Menu. Are you a homeowner board member or a resident calling about H-O-A and Community Management Services?",
                    prompt : {
                        prompt : `<TASKS>
${_joinSteps([
    `Briefly introduce yourself using the information in the IDENTITY section.`,
    `Follow the instruction in the MENU_SEQUENCE section but if at any point during the call (even if you are in the middle 
    of asking a question) the caller mentions a keyword defined in the KEYWORDS_AND_ACTIONS section then stop the script immediately and execute the action of the keyword. 

    <MENU_SEQUENCE>
    Guide the caller by asking the following questions one-by-one. After each question, pause and listen.
    1. "Are you a homeowner board member or a resident calling about H-O-A and Community Management Services?"
        - Tell "I am forwarding your call to our H-O-A and Community Management Services."
    2. "Are you a property owner or tenant calling about our rental management services, scheduling a showing, or selling your home?"
        - Tell "I am forwarding your call to our Property Management Services."
    3. "Would you like to get a name directory and know the name of the person you would like to talk to?"
        - Tell "I am forwarding your call to our Dial By Name assistant"
    4. "Would you like to leave your information for a callback from Intempus?"
        - Tell "I am forwarding your call to our Callback Form assistant"
    5. "Would you like to hear these options again?"
        - Go to the first task again
    </MENU_SEQUENCE>

    <KEYWORDS_AND_ACTIONS>
    Monitor the caller's speech for the following intents:
    ${getKeywordActionTable()}
    | Menu | Follow the instructions in MENU_SEQUENCE section |
    </KEYWORDS_AND_ACTIONS>`,
])}
</TASKS>

${elevenLabsConsts.systemPromptHeader}
${elevenLabsConsts.systemPromptFooter}`,
                        toolIds     : _getToolIds(toolsByName,['sendEmail']),
                        builtInTools: {
                            // "Intempus Introduction" transfers to special group extensions (leasing, emergency, etc)
                            transferToNumber: _getSystemToolConfigOutput(_getGroupExtensionTransfers())
                        },
                    }
                },
                languagePresets : {
                    es: {
                        overrides: {
                            agent: {
                                firstMessage: "Has llegado al menú principal de Intempus Realty. ¿Eres un miembro de la junta de propietarios o un residente que llama sobre los servicios de H-O-A y administración comunitaria?",
                            }
                        }
                    }
                },
                asr: {
                    keywords: _getAsrKeywords(contacts),
                },
                //turn : {
                //    turnTimeout : 4,
                //    initialWaitTime : 2
                //}
            }
        }
    );
};

export const getUnkHOA = (
    contacts    : Contacts.Contact[],
    toolsByName : Record<string,ElevenLabs.Tool>,
    agentsByName? : Record<string,any>,
) : CreateAgentRequest => {
    const config = Config.get();
    return _completeAgent(
        {
            name         : "Intempus HOA",
            conversationConfig  : {
                agent: {
                    firstMessage : "You have reached Intempus H-O-A department. Would you like to request H-O-A maintenance, H-O-A payments, parking calls, or something else?",
                    prompt : {
                        prompt : `<TASKS>
${_joinSteps([
    `Follow the instruction in the MENU_SEQUENCE section but if at any point during the call (even if you are in the middle 
    of asking a question) the caller mentions a keyword defined in the KEYWORDS_AND_ACTIONS section then stop the script immediately 
    and execute the action of the keyword. 

    <MENU_SEQUENCE>
    Guide the caller by asking the following questions one-by-one. After each question, pause and listen.
    Execute the instructions after each question as soon as you get an affirmative answer.
    a. "Are you calling about regular maintenance, parking calls or application status?"
        - Follow the instructions in the EMAILING_STEPS section.
        - Tell "I am forwarding your call to our regular maintenance services."
    b. "Are you calling about payments, estoppel requests, or community association management services sales?"
        - Follow the instructions in the EMAILING_STEPS section.
        - Tell "I am forwarding your call to our community association management payments."
    c. "Do you need an emergency maintenance assistance?"
        - Tell "I am forwarding your call to emergency maintenance."
    d. "Would you like to hear these options again?"
        - Go to the first task again
    e. "Would you like to return to the main menu?"
        - Forget the previous context and redirect the caller to the "Intempus Introduction" agent
    </MENU_SEQUENCE>

    <KEYWORDS_AND_ACTIONS>
    Monitor the caller's speech for the following intents:
    ${getKeywordActionTable()}
    | Menu | Follow the instructions in MENU_SEQUENCE section |
    | Main Menu, Top Menu | Forget *ALL* user answers and redirect the caller to the "Intempus Introduction" agent |
    </KEYWORDS_AND_ACTIONS>`,
])}
</TASKS>

${elevenLabsConsts.systemPromptHeader}

<EMAILING_STEPS>
${_joinSteps([
    "Ask for the caller's name",
    "Ask for the name of the property",
    "Confirm both details back to the caller",
    `ONLY AFTER confirming the caller's name and the property name, send an email using the 'sendEmail' tool with:
    - To: "${config.notificationEmailAddress||'mkhesin@intempus.net'}"
    - Subject: "New Call to HOA: [Property Name] - From [Caller Name]"
    - Body: "A caller named [Caller Name] is inquiring about property [Property Name] and is asking about [Caller's Request]"`
])}
</EMAILING_STEPS>

${elevenLabsConsts.systemPromptFooter}`,
                        toolIds : _getToolIds(toolsByName,['sendEmail']),
                        builtInTools: {
                            // "Intempus HOA" transfers to both "Intempus Introduction" and special group extensions (maintenance, emergency, etc)
                            transferToAgent:  _getTransferToAgent(_getAgentIds(agentsByName||{},["Intempus Introduction"])),
                            transferToNumber: _getSystemToolConfigOutput(_getGroupExtensionTransfers())
                        },
                    },
                },
                languagePresets: {
                    es: {
                        overrides: {
                            agent: {
                                firstMessage: "Has llegado al departamento de H-O-A de Intempus. ¿Desea solicitar mantenimiento de H-O-A, pagos de H-O-A, llamadas de estacionamiento o algo más?",
                            }
                        }
                    }
                },
                asr: {
                    keywords: _getAsrKeywords(contacts),
                }
            }
        }
    );
};

export const getUnkPropertyOwner = (
    contacts    : Contacts.Contact[],
    toolsByName : Record<string,ElevenLabs.Tool>,
    agentsByName? : Record<string,any>,
) : CreateAgentRequest => {
    const config = Config.get();
    return _completeAgent(
        {
            name         : "Intempus PropertyOwner",
            conversationConfig  : {
                agent: {
                    firstMessage : "This is Intempus Realty Property Owner menu.",
                    prompt : {
                        prompt: `<TASKS>
${_joinSteps([
    `Identify the category of the call by asking the next series of yes/no questions one-by-one.
    Pause after each question to give the user a chance to answer.
    Execute the instructions after each question as soon as you get an affirmative answer.
    If the user proactively identifies one of the categories below, then execute the corresponding instructions immediately.
    The questions and instructions are as follows:
    a. "Are you calling about rental property maintenance?"
        - Follow the instructions in the EMAILING_STEPS section.
        - Tell "I am forwarding your call to our regular maintenance services."
    b. "Are you calling about scheduling a showing, leasing, submitting a rental application, or making a rent payment?"
        - Follow the instructions in the EMAILING_STEPS section.
        - Tell "I am forwarding your call to our community association management payments."
    c. "Are you calling about selling a property?"
        - Follow the instructions in the EMAILING_STEPS section.
    d. "Are you calling about rental property emergency maintenance?"
        - Tell "I am forwarding your call to emergency maintenance."
    e. "Would you like to hear these options again?"
        - Go to the first task again
    g. "Would you like to return to the main menu?"
        - Redirect the caller to the "Intempus Introduction" agent`,
    `Ensure the caller is kept informed about the next steps or actions being taken on their behalf.`,
])}
</TASKS>

${elevenLabsConsts.systemPromptHeader}

<EMAILING_STEPS>
${_joinSteps([
    "Ask for the caller's name",
    "Ask for the name of the property",
    "Confirm both details back to the caller",
    `ONLY AFTER confirming the caller's name and the property name, send an email using the 'sendEmail' tool with:
    - To: "${config.notificationEmailAddress||'mkhesin@intempus.net'}"
    - Subject: "New Call to PropertyOwner: [Property Name] - From [Caller Name]"
    - Body: "A caller named [Caller Name] is inquiring about property [Property Name] and is asking about [Caller's Request]"`
])}
</EMAILING_STEPS>

${elevenLabsConsts.systemPromptFooter}`,
                        toolIds : _getToolIds(toolsByName,['sendEmail']),
                        builtInTools: {
                            // "Intempus PropertyOwner" transfers to both "Intempus Introduction" and special group extensions (maintenance, emergency, etc)
                            transferToAgent:  _getTransferToAgent(_getAgentIds(agentsByName||{},["Intempus Introduction"])),
                            transferToNumber: _getSystemToolConfigOutput(_getGroupExtensionTransfers())
                        },
                    }
                },
                languagePresets: {
                    es: {
                        overrides: {
                            agent: {
                                firstMessage: "Has llegado al departamento de H-O-A de Intempus. ¿Desea solicitar mantenimiento de H-O-A, pagos de H-O-A, llamadas de estacionamiento o algo más?",
                            }
                        }
                    }
                },
                asr: {
                    keywords: _getAsrKeywords(contacts),
                }
            }
        }
    );
};

export const getFAQ = (
    contacts    : Contacts.Contact[],
    toolsByName : Record<string,ElevenLabs.Tool>,
    agentsByName? : Record<string,any>,
) : CreateAgentRequest => {
    return _completeAgent(
        {
            name         : "Intempus FAQ",
            conversationConfig : {
                agent : {
                    firstMessage : "This is Intempus Realty FAQ menu. What question can I help you with today?",
                    prompt : {
                        prompt : `<TASKS>
${_joinSteps([
    `Ask caller: "Would you like to return to the main menu?"
        - Redirect the caller to the "Intempus Introduction" agent`
])}
</TASKS>
${elevenLabsConsts.systemPromptHeader}
${elevenLabsConsts.systemPromptFooter}`,
                        toolIds : [],
                        builtInTools: {
                            // "Intempus FAQ" transfers to both "Intempus Introduction" and special group extensions (maintenance, emergency, etc)
                            transferToNumber: _getSystemToolConfigOutput(_getGroupExtensionTransfers()),
                            transferToAgent:  _getTransferToAgent(_getAgentIds(agentsByName||{},["Intempus Introduction"]))
                        },
                    }
                },
                languagePresets : {
                    es: {
                        overrides: {
                            agent: {
                                firstMessage: "Hola, este es el menú de preguntas frecuentes de Intempus Realty",
                            }
                        }
                    }
                },
                asr: {
                    keywords: _getAsrKeywords(contacts),
                }
            },
        }
    );
};

export const getUnkCallbackForm = (
    contacts    : Contacts.Contact[],
    toolsByName : Record<string,ElevenLabs.Tool>,
    agentsByName? : Record<string,any>,
) : CreateAgentRequest => {
    const config = Config.get();
    return _completeAgent(
        {
            name         : "Intempus CallbackForm",
            conversationConfig : {
                agent : {
                    firstMessage : "",
                    prompt : {
                        prompt : `
<TASKS>
${_joinSteps([
    `Ask caller: "Please let us know if you are an existing or prospective client" and save the answer as 'clientType'`,
    `Ask caller: "Are you looking to rent your property, looking to buy a property or deciding to between renting and selling?" and save the answer as 'propertyInterest'.`,
    `If the caller is looking to rent their property, ask: "What is the address of your property" and save the answer as 'propertyAddress'. Otherwise ask: "What state, county or zip code you would like your to live in?" and save the answer as 'locationInterest'.`,
    `Ask caller: "What is your first and last name?" and save the answer as 'name'.`,
    `Ask caller: "Would you like to leave us your email address" and if the caller responds affirmatively, then ask "Please provide your email address", re-confirm it and after the re-confirmation save the answer as 'emailAddress'.`,
    `If the caller confirms the information, then tell them: "Thank you for providing this information. A representative will reach out to you shortly." and send an email:
        - To: "${config.notificationEmailAddress||'mkhesin@intempus.net'}"
        - Subject: "New Call for CallbackForm: [Property Name] - From [Caller Name]"
        - Body: "A client {{clientType}} is interested in {{propertyInterest}}. Property address is {{propertyAddress}}. Location of interest is {{locationInterest}}. Client name is {{name}}, email address is {{emailAddress}}, phone number is {{customer.number}}.`,
])}
</TASKS>

${elevenLabsConsts.systemPromptHeader}
${elevenLabsConsts.systemPromptFooter}`,
                        toolIds : _getToolIds(toolsByName,['sendEmail']),
                        builtInTools: {
                            // "Intempus CallbackForm" transfers to both "Intempus Introduction" and special group extensions (maintenance, emergency, etc)
                            transferToNumber: _getSystemToolConfigOutput(_getGroupExtensionTransfers()),
                            transferToAgent:  _getTransferToAgent(_getAgentIds(agentsByName||{},["Intempus Introduction"]))
                        },
                    }
                },
                languagePresets : {
                    es: {
                        overrides: {
                            agent: {
                                firstMessage: "",
                            }
                        }
                    }
                },
                asr: {
                    keywords: _getAsrKeywords(contacts),
                }
            }
        }
    );
};

export const getUnkDialByName = (
    contacts    : Contacts.Contact[],
    toolsByName : Record<string,ElevenLabs.Tool>,
    agentsByName? : Record<string,any>,
) : CreateAgentRequest => {
    const callRoutingInstructions = [
        ...contacts.map((c) => {
            return `If the user asks for "${c.name}", call dispatchCall with "${c.name}", wait for result and immediately follow the instructions of the result.`;
        }),
        `If user asks for anyone else then ask the user to repeat the name and then call dispatchCall with the name of the person. Wait for result and immediately follow the instructions of the result.`
    ];
    return _completeAgent(
        {
            name         : "Intempus DialByName",
            conversationConfig : {
                agent : {
                    firstMessage : "This is Intempus Realty Dial By Name directory. Who would you like to reach?.",
                    prompt : {
                        prompt : `<TASKS>
${_joinSteps([
    `Your main task is to assist callers in reaching the appropriate contact within Intempus Realty by name.`,
    `Greet the caller by saying "You reach the Intempus Realty Dial By Name directory".`,
    `Ask the caller for the name of the person they wish to reach and make sure that this name is mentioned in CALLROUTING section.,
       * If it is not mentioned, politely inform the caller that the name was not found and ask them to repeat or provide additional details.`,
    `Once you have the contact name, ask for the property name/address that the call is regarding.`,
    `Then ask for the caller's name.`,
    `After collecting all three pieces of information (contact name, property name, and caller name), confirm the details back to the caller.`,
    `After the confirmation, follow the instructions for the contact name in the CALLROUTING section.`,
    `If the caller wants to return to the main menu, redirect them to the "Intempus Introduction" agent.`,
    `Keep the caller informed about actions being taken and ensure they feel assisted throughout the process.`
])}
</TASKS>

${elevenLabsConsts.systemPromptHeader}
<CALLROUTING>
${_joinSteps(callRoutingInstructions)}
</CALLROUTING>
${elevenLabsConsts.systemPromptFooter}`,
                        toolIds : _getToolIds(toolsByName,['sendEmail','dispatchCall']),          
                        builtInTools: {
                            // "Intempus DialByName" transfers to both "Intempus Introduction" and all kinds of contacts.
                            transferToAgent:  _getTransferToAgent(_getAgentIds(agentsByName||{},["Intempus Introduction"])),
                            transferToNumber: _getSystemToolConfigOutput(_getContactTransfers(contacts))
                        },                    
                    }
                },
                languagePresets : {
                    es: {
                        overrides: {
                            agent: {
                                firstMessage: "Hola, este es el directorio de marcación por nombre de Intempus Realty. ¿A quién le gustaría comunicarse?",
                            }
                        }
                    }
                },
                asr: {
                    keywords: _getAsrKeywords(contacts),
                }
            },
        }
    );
};