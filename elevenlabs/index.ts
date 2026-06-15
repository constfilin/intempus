import * as Contacts    from '../Contacts';

import * as agents  from './agents';
import * as tools       from './tools';
import { ElevenLabs } from '@elevenlabs/elevenlabs-js';

export const agentsByName = {
    "Intempus Main"             : agents.getMain,
    "Intempus HOA"              : agents.getHOA,
    "Intempus PropertyOwner"    : agents.getPropertyOwner,
    "Intempus DialByName"       : agents.getDialByName,
    "Intempus CallbackForm"     : agents.getCallbackForm,
    "Intempus Introduction"     : agents.getIntroduction,
} as Record<string,(
    contacts        : Contacts.Contact[],
    toolsByName     : Record<string,ElevenLabs.Tool>,
    agentsByName?   : Record<string,any>,
) => ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost>;

//only accepts webhook tools, system tools need to be directly embedded into the agent definition
export const toolsByName = {
    'dispatchCall'              : tools.getDispatchCall,
    'guessState'                : tools.getGuessState,
    'getFAQAnswer'              : tools.getFAQAnswer,
    'getInstructionsByPhone'    : tools.getInstructionsByPhone,
    'getTransferInstructions'   : tools.getTransferInstructions,
    'setVariables'              : tools.setVariables
} as unknown as Record<string,(
    contacts        : Contacts.Contact[]
) => ElevenLabs.ToolRequestModel>;