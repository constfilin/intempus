#!/usr/bin/env node.

"use strict";

import path         from 'node:path';

import express      from 'express';
import ejs          from 'ejs';

import Server       from './Server';
import api          from './api/';

const web = async () => {
    const server = await (new Server()).init();
    const app    = express();
    app.engine('ejs',(path,data,cb) => ejs.renderFile(path,data,cb));
    // Adding the next line breaks api/index.ts where the request body needs to be read as a string
    //app.use(express.json({limit:'1mb'}));
    app.use(express.urlencoded({extended:true}));
    app.set('trust proxy','loopback');
    app.use("/api",api());
    app.listen(server.config.web.port,'localhost',() => {
        server.moduleLog(module.filename,0,`Started at port ${server.config.web.port} at log level ${server.config.loglevel}`);
    });
};

web();