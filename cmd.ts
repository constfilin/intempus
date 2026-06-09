import commandLineArgs      from 'command-line-args';
import { getCmdPromise }    from './getCmdPromise';
import Server               from './Server';

const cmd = async () => {
    const server = await (new Server()).init();
    const argv = commandLineArgs([
        { name : 'cmd'            , alias: 'c', type: String },
        { name : 'id'             , alias: 'i', type: String },
        { name : 'name'           , alias: 'n', type: String },
        { name : 'stringify'      , alias: 's', type: Boolean },
        { name : 'sessionId'      ,             type: String },
        { name : 'phoneNumber'    , alias: 'p', type: String },
        { name : 'question'       , alias: 'q', type: String },
        { name : 'limit'          , alias: 'l', type: Number },
        // for listConversations command
        { name : 'callSuccessful'     , alias: 'f', type: String },
        { name : 'callStartBeforeUnix', alias: 'b', type: Number },
        { name : 'callStartAfterUnix' , alias: 'a', type: Number },
        { name : 'callDurationMinSecs', alias: 'd', type: Number },
        { name : 'exitCodeCount'      , alias: 'e', type: Boolean },
    ]);
    getCmdPromise(argv)()
        .then( (r:any) => {
            if( argv.stringify )
                console.log(JSON.stringify(r,null,4));
            else
                console.log(r);
            if( argv.exitCodeCount && (typeof r.exitCode === 'number') )
                process.exit(r.exitCode);
            return r;
        })
        .catch( (err:any) => {
            console.error(err);
            process.exit(-1);
        })
        .finally(() => {
            process.exit(0);
        });
}

cmd();
