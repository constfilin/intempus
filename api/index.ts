import util                 from 'node:util';

import express              from 'express';
import * as expressCore     from 'express-serve-static-core';
import { ElevenLabs }       from '@elevenlabs/elevenlabs-js';
import * as ELSerialization from '@elevenlabs/elevenlabs-js/serialization';

import { server }           from '../Server';
import { getCmdPromise }    from '../getCmdPromise';
import dayjs                from '../day-timezone';
import * as misc            from '../misc';
import * as ELabConsts      from '../elevenlabs/consts';
import stateByAreaCode      from './stateByAreaCode';
import * as VapeApi         from './VapeApi';
import * as ELabsConsts     from '../elevenlabs/consts';

const _callVapeApiWithBan = <T>( callName: string, call: () => Promise<T> ) : Promise<T> => {
    const now = new Date();
    if( server.ban_vape_api_until_date && (now<(server.ban_vape_api_until_date||now)) ) {
        const remainingSec = Math.ceil((server.ban_vape_api_until_date.getTime() - now.getTime()) / 1000);
        server.module_log(module.filename,1,`VapeApi banned: ${remainingSec}s remaining`);
        return Promise.reject(new Error(`VapeApi is temporarily unavailable (ban expires in ${remainingSec}s)`));
    }
    const timeoutMs = (server.config.vapeApi.timeoutSec||10) * 1000;
    const banPeriodMs = (server.config.vapeApi.banPeriodSec||60) * 1000;
    let   callFinishedAt = undefined as Date|undefined;
    const timeoutPromise = new Promise<never>((resolve,reject) => {
        setTimeout(() => {
            if( callFinishedAt )
                return resolve(0 as never);
            server.ban_vape_api_until_date = new Date(Date.now() + banPeriodMs);
            server.module_log(module.filename,0,`VapeApi.${callName} timed out after ${server.config.vapeApi.timeoutSec}s, banning for ${server.config.vapeApi.banPeriodSec}s`);
            reject(new Error(`VapeApi timed out after ${server.config.vapeApi.timeoutSec}s`));
        }, timeoutMs);
    });
    return Promise.race([ 
        timeoutPromise, 
        call().then( t => {
            server.module_log(module.filename,2,`VapeApi.${callName} took ${Date.now()-now.getTime()}ms`,t);
            return t;
        }).catch( err => {
            server.module_log(module.filename,1,`VapeApi.${callName} threw error after ${Date.now()-now.getTime()}ms:`,err);
            throw err;
        }).finally( () => {
            callFinishedAt = new Date();
        })
    ]);
};

const sendResponse = ( 
    req     : expressCore.Request, 
    res     : expressCore.Response, 
    response: any 
) => {
    const start_at = Date.now();
    const log_response = ( response:any ) => {
        const duration_ms = Date.now()-start_at;
        if( Array.isArray(response) ) {
            const elems_to_log = 3;
            const slice_to_log = response.slice(0,elems_to_log);
            server.module_log(
                module.filename, 1, `${req.method} to ${req.originalUrl} (${duration_ms}ms):`,
                slice_to_log,
                `(${response.length} elems)`
            );
        }
        else {
            let str_to_log = String(response);
            if( str_to_log==='[object Object]' )
                str_to_log = JSON.stringify(response);
            server.module_log(
                module.filename, 1, `${req.method} to ${req.originalUrl} (${duration_ms}ms):`,
                str_to_log.substring(0,50),
                `(${str_to_log?.length} chars)`
            );
        }
    }
    const log_and_send_response = ( value:any ) => {
        log_response(value);
        if( value?.err )
            res.status(500);
        res.send(value);
        res.end();
        return value;
    };
    const err_to_response = ( err:Error ) : Record<string,any> => {
        // Make sure to remove all stack and tec details
        // .err in the result will indicate an error
        return {
            err : err.message,
        };
    }
    // Else convert result to something that we can send
    if( response instanceof Function ) {
        try {
            response = response();
        }
        catch( err ) {
            // common.module_log(module.filename,0,`exception on function `,err);
            return log_and_send_response(err_to_response(err as Error));
        }
    }
    if( util.types.isPromise(response) ) {
        return response.then(log_and_send_response).catch( err => {
            server.module_log(module.filename,0,`exception on promise `,err);
            return log_and_send_response(err_to_response(err));
        });
    }
    return log_and_send_response(response);
}
const guessState = ( phoneNumber:string ) : string => {
    // Guess the state from the phone number
    const re = /^(\+1)?(\d{3})\d{7}/;
    const match = phoneNumber.match(re);
    if( !match )
        return 'unknown';
    return stateByAreaCode[match[2]] || 'unknown';
}
export default () => {
    const router   = express.Router();
    router.post('/tool/setVariables',express.json({type:'application/json'}),(req:expressCore.Request,res:expressCore.Response) => {
        return sendResponse(req,res,async () => {
            if( req.get(server.config.web.header_name)!==server.config.provider.toolSecret )
                throw Error(`Access denied`);
            const { 
                emailAddress, 
                callerName, 
                propertyId, 
                callReason 
            } = req.body as Record<string,any>;
            return {
                emailAddress,
                callerName,
                propertyId,
                callReason,
                result : `ok`
            };
        });
    });
    router.post('/tool/dispatchCall',express.json({type:'application/json'}),(req:expressCore.Request,res:expressCore.Response) => {
        return sendResponse(req,res,async () => {
            if( req.get(server.config.web.header_name)!==server.config.provider.toolSecret )
                throw Error(`Access denied`);
            const { name } = req.body as Record<string,any>;
            const phoneNumber =  server.config.simulatedPhoneNumber || req.body.phoneNumber as string;
            if( !name )
                throw Error(`Invalid arguments`);
            const contacts = await server.getContacts();
            const canonicalName = misc.canonicalizePersonName(name);
            const contact = contacts.find( c => {
                // Note: column names are case sensitive
                return c.name===canonicalName;
            });
            if( !contact )
                throw Error(`Cannot find name '${canonicalName}' in ${server.config.contacts.worksheetName}`);
            const djs    = dayjs().tz(contact.timeZone||'America/Los_Angeles');
            const hour   = djs.hour();
            const vmPrompt = contact.vmPrompt || `to describe its issue to '${canonicalName}'`;
            const result =  ([0,6].includes(djs.day()) || (hour<contact.businessStartHour) || (hour>=contact.businessEndHour)) ?
                `ask the user ${vmPrompt}, save its answer to a text and call tool "setVariables" with emailAddress equal "${contact.emailAddresses[0]}" and callReason set to that text` :
                `ask user to confirm that the user wants to talk to '${canonicalName}'. If user confirms, then transfer the call to +1${contact.phoneNumbers[0]}. Otherwise ask user again the user wants to speak to.`;
            server.module_log(module.filename,2,`Handled 'dispatchCall'`,{ name },result);
            return result;
        });
    });
    router.post('/tool/guessState',express.json({type:'application/json'}),(req:expressCore.Request,res:expressCore.Response) => {
        return sendResponse(req,res,async () => {
            if( req.get(server.config.web.header_name)!==server.config.provider.toolSecret )
                throw Error(`Access denied`);
            const { phoneNumber } = req.body as Record<string,any>;
            if( !phoneNumber )
                throw Error(`Invalid arguments`);
            return guessState(phoneNumber);
        });
    });
    router.post('/tool/getFAQAnswer',express.json({type:'application/json'}),(req:expressCore.Request,res:expressCore.Response) => {
        return sendResponse(req,res,() => {
            if( req.get(server.config.web.header_name)!==server.config.provider.toolSecret )
                throw Error(`Access denied`);
            const sessionId = req.body.sessionId as string || 'unknown_session';
            const question = req.body.question as string;
            if( !question )
                throw Error(`Invalid arguments`);
            return _callVapeApiWithBan('getFAQAnswer',() => {
                return VapeApi.getFAQAnswer(sessionId,question);
            }).then( faqAnswer => {
                return faqAnswer;
            }).catch( err => {
                return {
                    session_id  : sessionId,
                    reply       : `Follow the instructions in CONNECTING_WITH_INTEMPUS section.`
                };  
            });
        });
    });
    router.post('/tool/getInstructionsByPhone',express.json({type:'application/json'}),(req:expressCore.Request,res:expressCore.Response) => {
        return sendResponse(req,res,async () => {
            if( req.get(server.config.web.header_name)!==server.config.provider.toolSecret )
                throw Error(`Access denied`);
            try {
                const phoneNumber = req.body.phoneNumber as string;
                if( !phoneNumber )
                    throw Error(`Invalid phone number`);
                const sessionId = req.body.sessionId as string;
                if ( !sessionId )
                    throw Error(`Invalid session ID`);
                return _callVapeApiWithBan('getUserByPhone', () => {
                    return VapeApi.getUserByPhone(sessionId,phoneNumber);
                }).then( user => {
                    if( !user.user )
                        throw Error(`User is empty`);
                    return {
                        session_id          : sessionId,
                        user_first_name     : (user.user.first_name||''),
                        user_last_name      : (user.user.last_name||''),
                        [ELabsConsts.phoneTransferDestinationVarName]   : user.contact_phone,
                        instructions        : `Greet the user by saying "Hi, ${user.user.first_name||'there'}!". Then follow the instructions in "QUESTIONS_AND_ANSWERS" section.`
                    };
                }).catch( err => {
                    return {
                        session_id          : sessionId,
                        first_name          : '',
                        last_name           : '',
                        [ELabsConsts.phoneTransferDestinationVarName]: '',
                        instructions        : `Greet the user by saying "Hi, there!". Then follow the instructions in UNKNOWN_CALLER section.`
                    };
                });
            }
            catch( err ) {
                return {
                    session_id          : req.body.sessionId,
                    user_first_name     : '',
                    user_last_name      : '',
                    [ELabsConsts.phoneTransferDestinationVarName]   : '',
                    instructions        : `Greet the user by saying "Hi, there!". Then immediately follow the instructions in UNKNOWN_CALLER section.`
                }  
            }
        });
    });
    router.post('/tool/getTransferInstructions',express.json({type:'application/json'}),(req:expressCore.Request,res:expressCore.Response) => {
        return sendResponse(req,res,() => {
            if( req.get(server.config.web.header_name)!==server.config.provider.toolSecret )
                throw Error(`Access denied`);
            const sessionId  = req.body.sessionId as string || 'unknown_session';
            const propertyId = req.body.propertyId as string;
            const sectionName = req.body.sectionName as string;
            const getRedirectToIntempusIntroductionResult = ( instructions:string ) => {
                return {
                    session_id              : sessionId,
                    [ELabsConsts.phoneTransferDestinationVarName]    : '',
                    instructions            : instructions,
                    // Testing has discovered that if a name of an agent is returned in the instructions then 
                    // ElevenLabs fails to redirect the to that agent. It says that hte agent is "unknown", 
                    // see https://github.com/constfilin/intempus/issues/15#issuecomment-4492663954
                    // 
                    // So instead of simply returning the instructions to redirect to "Intempus Introduction",
                    // we are going to error out of the tool and the system prompt of the agent needs to be
                    // written so that the tool error is properly handled and the agent take the desired action
                    // in this case. 
                    err                     : instructions  
                };
            };
            return _callVapeApiWithBan('getTransferTarget',() => {
                return VapeApi.getTransferTarget(sessionId,propertyId);
            }).then( transferTarget => {
                if( sectionName ) {
                    // Here this means that the caller just wants to know if the caller is identified
                    // but the caller is not yet ready to transfer the call to a phone number.
                    if( transferTarget.contact_phone )
                        return {
                            session_id          : sessionId,
                            [ELabsConsts.phoneTransferDestinationVarName]  : transferTarget.contact_phone,
                            instructions        : `Follow the instructions in ${sectionName} section.`
                        };
                } 
                else {
                    // The caller wants to transfer the call to a specific phone number
                    if( transferTarget.contact_name && transferTarget.contact_phone )
                        return {
                            session_id          : sessionId,
                            [ELabsConsts.phoneTransferDestinationVarName]   : transferTarget.contact_phone,
                            instructions        : `Say 'Transferring the call to ${transferTarget.contact_name}.' and call tool "transfer_to_number" passing "${transferTarget.contact_phone}" in "${ELabConsts.phoneTransferDestinationVarName}" dynamic variable.`
                        };
                    if( transferTarget.contact_phone )
                        return {
                            session_id          : sessionId,
                            [ELabsConsts.phoneTransferDestinationVarName]   : transferTarget.contact_phone,
                            instructions        : `Call tool "transfer_to_number" passing "${transferTarget.contact_phone}" in "${ELabConsts.phoneTransferDestinationVarName}" dynamic variable.`
                        };
                }
                // Adding special word "Immediately" here to be able to tell this case from
                // the exception handler case below.
                return getRedirectToIntempusIntroductionResult(`Immediately transfer the call to "Intempus Introduction" agent.`);
            }).catch( err => {
                return getRedirectToIntempusIntroductionResult(`Transfer the call to "Intempus Introduction" agent.`);
            });
        });
    });
    router.post('/pre-call',express.json({type:'application/json'}),(req:expressCore.Request,res:expressCore.Response) => {
        return sendResponse(req,res,async () => {
            if( req.get(server.config.web.header_name)!==server.config.provider.toolSecret )
                throw Error(`Access denied`);
            if( typeof req.body !== 'object' || req.body===null )
                throw Error(`Invalid request body`);
            const agentsById = await server.elevenLabsApi.getAgents().list().then( res => {
                return res.agents.reduce( (acc,a) => {
                    acc[a.agentId] = a;
                    return acc;
                },{} as Record<string,ElevenLabs.AgentSummaryResponseModel>);
            });
            const agent = agentsById[req.body.agent_id as string];
            if( !agent )
                throw Error(`Agent with id '${req.body.agent_id}' not found`);
            switch( agent.name ) {
                case "Intempus Main":
                case "Intempus Introduction":
                    // See https://elevenlabs.io/docs/eleven-agents/customization/personalization/twilio-personalization
                    // We need to customize the first prompt
                    return {
                        type : "conversation_initiation_client_data",
                        dynamic_variables : {
                            [ELabConsts.phoneTransferDestinationVarName] : ''
                        },
                        conversation_config_override : {
                            agent : {
                                /*
                                prompt : {
                                    prompt : `*Immediately* redirect the caller to the "Intempus Introduction" agent`
                                },
                                */
                                first_message : ``,
                            }
                        }
                    }
            }
            server.module_log(module.filename,1,`No specific pre-call handling for agent '${agent.name}'`);
            return {
            };
        });
    });
    router.post('/post-call',express.text({type:'application/json'}),(req:expressCore.Request,res:expressCore.Response) => {
        return sendResponse(req,res,async () => {
            const body_str = req.body;
            if( typeof body_str !== 'string' )
                throw Error(`Unexpected type of the body ${typeof body_str}`);
            const body_obj = JSON.parse(body_str);
            if( body_obj.type==='post_call_transcription' ) {

                // following the example on
                // https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
                // HMAC validation of elevenlabs secret is used instead of header secret, since elevenlabs does not allow custom headers
                const signature = (req.header('ElevenLabs-Signature')||'');
                const secret    = server.config.elevenLabs!.summarySecret;
                const event = await server.elevenLabsApi.webhooks.constructEvent(
                    body_str,
                    signature,
                    secret
                );
                // The customer requests an email to be sent to the customer if the call is transferred to a number
                // First try the easy way
                const dynamicVariableNames = {
                    emailAddress    : true,
                    callerName      : true,
                    propertyId      : true,
                    callReason      : true
                };
                const serverMessage = event.data as ELSerialization.GetConversationResponseModel.Raw;
                const callSummary   = (serverMessage.analysis?.transcript_summary||'n/a').replace(/in\s*tempest/gi,'Intempus'); 
                const callData      =  Object.entries(serverMessage.conversation_initiation_client_data?.dynamic_variables||{}).reduce((acc,[name,value])=>{
                    if( name in dynamicVariableNames && value )
                        acc[name] = value as string;
                    return acc;
                },{
                    emailAddress : (server.config.notificationEmailAddress||'mkhesin@intempus.net')
                } as Record<string,string>);
                const emailSubject  = `${serverMessage.analysis?.call_summary_title||`Call to ${serverMessage.agent_name}`} with status ${serverMessage.status}`
                const emailText     = `Summary:\n
${callSummary}\n
\n
Call Data:\n
${Object.entries(callData).map(([name,value]) => {
    return `${name} : ${value}`;
}).join("\n")}
\n
Transcript:\n
${serverMessage.transcript.filter( t=>(!!t.message)).map( t => {
    return `At ${t.time_in_call_secs}s ${t.role}: ${t.message}`;
}).join("\n")}\n`;
                server.module_log(module.filename,2,`Got assistant '${serverMessage.agent_name}' notification '${body_obj.type}'`,{
                    status          : serverMessage.status,
                    agentsName      : serverMessage.agent_name,
                    callSummary,
                    callData,
                    emailSubject,
                    emailText
                });
                server.sendEmail({
                    to      :   callData.emailAddress,
                    subject :   emailSubject,
                    text    :   emailText
                }).then(() => {
                    server.module_log(module.filename,2,`Sent email with call summary '${callSummary}' to '${callData.emailAddress}'`);
                }).catch( err => {
                    server.module_log(module.filename,1,`Cannot send an email with call summary '${callSummary}' to '${callData.emailAddress}' (${err.message})`);
                });
            }
        });
    });
    router.post('/cmd',express.json({type:'application/json'}),(req:expressCore.Request,res:expressCore.Response) => {
        return sendResponse(req,res,() => {
            if( req.get(server.config.web.header_name)!==server.config.provider.toolSecret )
                throw Error(`Access denied`);
            return getCmdPromise(req.body as Record<string,any>)();
        });
    });
    router.options('/tool',(req:expressCore.Request,res:expressCore.Response) => {
        return sendResponse(req,res,() => {
            res.setHeader('Access-Control-Allow-Origin', 'https://api.elevenlabs.io');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            return '';
        });
    });
    return router;
};
