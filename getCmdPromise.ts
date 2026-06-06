import * as elevenLabs      from './elevenlabs';
import { server }           from './Server';
import * as VapeApi         from './api/VapeApi';

export const getCmdPromise = ( args:Record<string,any> ) => {

    if( !server?.elevenLabsApi )
        throw Error(`elevenLabsApi is not initialized yet`);
    const tools         = server.elevenLabsApi.getTools();
    const agents        = server.elevenLabsApi.getAgents();
    // const structuredOutputs = vapiApi.getStructuredOutputs();

    // Commands to manage tools
    switch( args.cmd ) {
    case 'getContacts':
        return (async () => {
            const warns = [] as string[];
            return {
                contacts : await server.getContacts(warns),
                warns,
            };
        });
    case 'getUserByPhone':
        return (() => VapeApi.getUserByPhone(
            args.sessionId as string,
            args.phoneNumber as string
        ));
    case 'getFAQAnswer':
        return (() => VapeApi.getFAQAnswer(
            args.sessionId   as string,
            args.question as string
        ));
    case 'getTransferTarget':
        return (() => VapeApi.getTransferTarget(
            args.sessionId as string,
            args.name as string
        ));
    case 'listPhoneNumbers':
        return (() => server.elevenLabsApi.conversationalAi.phoneNumbers.list());
    case 'deletePhoneNumber':
        return (() => server.elevenLabsApi.conversationalAi.phoneNumbers.delete(args.id));
    case 'listConversations':
        const listArgs = {} as Record<string,any>;
        // Sanitize the arguments for listConversations request
        if( args.id )
            listArgs.agentId = args.id;
        if( typeof args.callSuccessful === 'string' )
            listArgs.callSuccessful = args.callSuccessful.toLowerCase();
        if( typeof args.callStartBeforeUnix === 'number' && (args.callStartBeforeUnix>0) )
            listArgs.callStartBeforeUnix = args.callStartBeforeUnix;
        if( typeof args.callStartAfterUnix === 'number' && (args.callStartAfterUnix>0) && (args.callStartAfterUnix<(listArgs.callStartBeforeUnix||Infinity)) )
            listArgs.callStartAfterUnix = args.callStartAfterUnix;
        if( typeof args.callDurationMinSecs === 'number' && args.callDurationMinSecs >= 0 )
            listArgs.callDurationMinSecs = args.callDurationMinSecs;
        if( typeof args.limit === 'number' && args.limit > 0 )
            listArgs.pageSize = args.limit;
        // Read to call
        return (() => server.elevenLabsApi.conversationalAi.conversations.list(listArgs).then( res => {
            return {
                ...res,
                exitCode : res.conversations.length
            };
        }));
    case 'getToolById':
        return (() => tools.get(args.id as string));
    case 'getTool':
    case 'getToolByName':
        return (() => tools.getByName(args.name));
    case 'listTools':
        return (async () => {
            return (await tools.list());
        });
    case 'getAgentById':
        return (() => agents.get(args.id));
    case 'getAgent':
    case 'getAgentByName':
        return (() => agents.getByName(args.name));
    case 'listAgents':
        return (() => agents.list());
    //TODO: add structured outputs

    // case 'getStructuredOutputById':
    //     return (() => structuredOutputs.structuredOutputControllerFindOne({id:args.id}));
    // case 'getStructuredOutput':
    // case 'getStructuredOutputByName':
    //     return (() => structuredOutputs.getByName(args.name));
    // case 'listStructuredOutputs':
    //     return (async () => {
    //         const response = await structuredOutputs.structuredOutputControllerFindAll();
    //         return (response.results || []).map( so => {
    //             return {
    //                 id          : so.id,
    //                 name        : so.name,
    //                 description : so.description
    //             }
    //         });
    //     });
    case 'credateTool':
        return  (async () => {
            const [
                contacts,
                existingTool,
            ] = await Promise.all([
                server.getContacts(),
                tools.getByName(args.name),
            ]);
            return tools.credate(
                elevenLabs.toolsByName[args.name](contacts),
                existingTool
            );
        });
    case 'credateAgent':
        return  (async () => {
            const [
                contacts,
                toolsByName,
                existingAgent,
                agentsByName,
            ] = await Promise.all([
                server.getContacts(),
                tools.listByName(),
                agents.getByName(args.name),
                agents.listByName(),
            ]);
            return agents.credate(
                elevenLabs.agentsByName[args.name](contacts,toolsByName,agentsByName),
                existingAgent
            );
        });
    // case 'credateStructuredOutput':
    //     return  (async () => {
    //         const [
    //             contacts,
    //             assistantsByName,
    //             existingStructuredOutput,
    //         ] = await Promise.all([
    //             Contacts.get(),
    //             agents.listByName(),
    //             structuredOutputs.getByName(args.name),
    //         ]);
    //         return structuredOutputs.credate(
    //             intempus.structuredOutputsByName[args.name](contacts, assistantsByName),
    //             existingStructuredOutput
    //         );
    //     });
    case 'credateTools':
        return (async () => {
            const [ 
                contacts,
                toolsByName
            ] = await Promise.all([
                server.getContacts(),
                tools.listByName(),
            ]);
            return Promise.all(
                Object.entries(elevenLabs.toolsByName).map( ([toolName,getToolDto]) => {
                    return tools.credate(
                        getToolDto(contacts),
                        toolsByName[toolName]
                    );
                })
            );
        });
    case 'credateAgents':
        return (async () => {
            const [
                contacts,
                toolsByName,
                agentsByName,
            ] = await Promise.all([
                server.getContacts(),
                tools.listByName(),
                agents.listByName(),
            ]);
            return Promise.all(
                Object.entries(elevenLabs.agentsByName).map( ([agentName,getAgentDto]) => {
                    return agents.credate(
                        getAgentDto(contacts,toolsByName,agentsByName),
                        agentsByName[agentName]
                    );
                })
            );
        });
    // case 'credateStructuredOutputs':
    //     return (async () => {
    //         const [
    //             contacts,
    //             assistantsByName,
    //             structuredOutputsByName
    //         ] = await Promise.all([
    //             Contacts.get(),
    //             agents.listByName(),
    //             structuredOutputs.listByName(),
    //         ]);
    //         return Promise.all(
    //             Object.entries(intempus.structuredOutputsByName).map( ([outputName,getOutputDto]) => {
    //                 return structuredOutputs.credate(
    //                     getOutputDto(contacts, assistantsByName),
    //                     structuredOutputsByName[outputName]
    //                 );
    //             })
    //         );
    //     });
    case 'credateAll':
        return (async () => {
            const [
                contacts,
                toolsByName,
                agentsByName,
                // structuredOutputsByName
            ] = await Promise.all([
                server.getContacts(),
                tools.listByName(),
                agents.listByName(),
                // structuredOutputs.listByName(),
            ]);
            return Promise.all([
                ...Object.entries(elevenLabs.agentsByName).map( ([agentName,getAgentDto]) => {
                    return agents.credate(
                        getAgentDto(contacts,toolsByName,agentsByName),
                        agentsByName[agentName]
                    );
                }),
                ...Object.entries(elevenLabs.toolsByName).map( ([toolName,getToolDto]) => {
                    return tools.credate(
                        getToolDto(contacts),
                        toolsByName[toolName]
                    );
                }),
                // ...Object.entries(intempus.structuredOutputsByName).map( ([outputName,getOutputDto]) => {
                //     return structuredOutputs.credate(
                //         getOutputDto(contacts, agentsByName),
                //         structuredOutputsByName[outputName]
                //     );
                // })
            ]);
        });
    // case 'getCallSuccessRate':
    //     return (() => vapiApi.getCallSuccessRate(args.id));
    // case 'getAverageCallSuccessRate':
    //     return (() => vapiApi.getAverageCallSuccessRate(args.limit));
    // case 'getCallStructuredOutputs':
    //     return (() => vapiApi.getCallStructuredOutputs(args.id));
    // case 'listCalls':
    //     return (() => vapiApi.listCalls(args.limit));
    }
    // Nothing is found
    return () => {
        return Promise.reject(Error(`Unknown command '${args.cmd}'`));
    }
}

