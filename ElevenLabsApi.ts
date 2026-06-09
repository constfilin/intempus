import { ElevenLabs, ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

import { server }               from './Server';

const dummyElevenLabsClient = {} as ElevenLabsClient;

type MyTools = (typeof dummyElevenLabsClient.conversationalAi.tools) & {
    getByName( name?:string ) : Promise<ElevenLabs.ToolResponseModel|undefined> ;
    listByName() : any;
    credate( payload: ElevenLabs.ToolRequestModel, tool:(ElevenLabs.ToolRequestModel|undefined) ) : any;
}
type MyAgents = (typeof dummyElevenLabsClient.conversationalAi.agents) & {
    getByName( name?:string ) : any;
    listByName() : any;
    credate( payload: any, agent: any ) : any;
}

export class ElevenLabsApi extends ElevenLabsClient {
    constructor() {
        if( !server.config.elevenLabs )
            throw Error(`Invalid provider type ${server.config.providerType}`);
        super({ apiKey: server.config.elevenLabs!.apiKey });
    }
    getTools() : MyTools {
        const tools = super.conversationalAi.tools as MyTools;
        
        tools.getByName = ( name?:string ) : Promise<ElevenLabs.ToolResponseModel|undefined> => {
            if( !name )
                throw Error(`name should be provided`);
            return tools.list().then( res => {
                return res.tools.find(t=>(t.toolConfig.type !== 'mcp' && t.toolConfig.name===name));
            });
        }
        tools.listByName = () : any => {
            return tools.list().then( (res) => {
                return res.tools.reduce( (acc,t) => {
                    if(t.toolConfig.type !== 'mcp')
                        acc[t.toolConfig.name] = t;
                    return acc;
                },{} as Record<string,any>);
            });
        }
        tools.credate = ( payload: ElevenLabs.ToolRequestModel, existingTool:(ElevenLabs.ToolResponseModel|undefined) ) : any => {
            if( existingTool )
                return tools.update(existingTool.id,payload);
            else
                return tools.create(payload);
        }
        return tools;
    }
    getAgents() : MyAgents {
        const agents = super.conversationalAi.agents as MyAgents;
        
        agents.getByName = ( name?:string ) : any => {
            if( !name )
                throw Error(`name should be provided`);
            return agents.list().then( res => {
                return res.agents.find(a=>a.name===name);
            });
        }
        agents.listByName = () : any => {
            return agents.list().then( (res) => {
                return res.agents.reduce( (acc,a) => {
                    acc[a.name] = a;
                    return acc;
                },{} as Record<string,any>);
            });
        }
        agents.credate = ( payload: any, existingAgent: any) : any => {
            if( existingAgent )
                return agents.update(existingAgent.agentId,payload);
            else
                return agents.create(payload);
        }
        return agents;
    }
}