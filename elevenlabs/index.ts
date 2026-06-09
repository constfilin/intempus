import * as Contacts    from '../Contact';

import { ElevenLabs } from '@elevenlabs/elevenlabs-js';
import * as agents  from './agents';
import * as tools   from './tools';
import Contact      from '../Contact';

export const agentsByName = {
    "Intempus Main"             : agents.getMain,
    "Intempus HOA"              : agents.getUnkHOA,
    "Intempus PropertyOwner"    : agents.getUnkPropertyOwner,
    "Intempus DialByName"       : agents.getUnkDialByName,
    "Intempus CallbackForm"     : agents.getUnkCallbackForm,
    "Intempus Introduction"     : agents.getUnkIntroduction,
} as Record<string,(
    contacts        : Contact[],
    toolsByName     : Record<string,ElevenLabs.Tool>,
    agentsByName?   : Record<string,any>,
) => ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost>;

//only accepts webhook tools, system tools need to be directly embedded into the agent definition
export const toolsByName = {
    'dispatchCall'              : tools.getDispatchCall,
    'sendEmail'                 : tools.getSendEmail,
    'guessState'                : tools.getGuessState,
    'getFAQAnswer'              : tools.getFAQAnswer,
    'getInstructionsByPhone'    : tools.getInstructionsByPhone,
    'getTransferInstructions'   : tools.getTransferInstructions,
} as unknown as Record<string,(
    contacts        : Contact[]
) => ElevenLabs.ToolRequestModel>;