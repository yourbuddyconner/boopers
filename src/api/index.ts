import "reflect-metadata";
import express from "express";
import { GetVerificationKey, expressjwt as jwt } from "express-jwt";
import * as tq from 'type-graphql'
import { config, prisma, sentryInit } from '../lib/config';
import { resolvers } from "./schema";
import { Context, Auth } from "./context";
import authChecker, { Rule } from "typegraphql-authchecker";
import { Request, Response } from "express";
import http from 'http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
// for graceful shutdown
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import cors from 'cors';
import { json } from 'body-parser';
import winston from 'winston';
import expressWinston from 'express-winston';
import { AuthChecker } from "type-graphql";
import jwksRsa from "jwks-rsa";
import asyncHandler from 'express-async-handler';
import bodyParser from 'body-parser';
import * as Sentry from "@sentry/node";
import { auth0LoginHook } from "./hooks/auth0";


enum FileType {
    INVENTORY = "INVENTORY",
    POS = "POS"
}

const graphqlLoggingMiddleware = async (resolve: any, root: any, args: any, context: any, info: any) => {
    console.log(`🚀 ${info.operation.operation} ${info.parentType.name}.${info.fieldName}`);
    return resolve(root, args, context, info);
}


const main = async () => {
    // set up express server
    const app = express();
    sentryInit(app);

    app.use(expressWinston.logger({
        transports: [
            new winston.transports.Console()
        ],
        format: winston.format.combine(
            winston.format.json()
        ),
        meta: true, // Include metadata
        dynamicMeta: (req) => {
            if (req.body?.query) {
                return {
                    graphqlQuery: req.body.query,
                    variables: req.body.variables,
                };
            }
            return {};
        }
    }));
    
    
    app.use('/v3/hooks/login',
        json(),
        async (req, res) => {
            const secret = req.headers['x-hook-secret'];
            if (secret !== config.auth0.auth0_hook_secret) {
                return res.status(401).send('Auth0 Hook Secret is invalid');
            }
            console.log(JSON.stringify(req.params))
            const email = req.body.email;
            // assert email and organizationId are not null
            if (!email) {
                return res.status(400).send('Email is required');
            }
            
            console.log(`Email: ${email}`)
            let payload;
            try {
                payload = await auth0LoginHook(email);
                console.log(`Payload: ${JSON.stringify(payload, null, 2)}`)
            }
            catch (err) {
                console.log(err.message)
                // user does not exist in the database
                if (err.message.includes('does not exist')) {
                    return res.status(403).send(err.message);
                }
                // domain is not whitelisted
                else if (err.message.includes('is not whitelisted')) {
                    return res.status(403).send(err.message);
                }
                // unknown error
                else {
                    return res.status(500).send(err.message);
                }
            }
            return res.status(200).send(payload);
        }
    );

    // healthz endpoint
    app.get('/healthz',
        (req, res) => {
            res.send('ok');
        }
    );

    const gqlPath = config.api.graphql_path;
    console.log(`☢️ Server starting at http://localhost:${config.api.port}${gqlPath}`)

    // build TypeGraphQL executable schema
    // and set up apollo server
    const schema = await tq.buildSchema({
        resolvers,
        validate: false,
        // authChecker: authChecker,
    })

    // app.use(morgan('combined'))
    const httpServer = http.createServer(app);
    const server = new ApolloServer<Context>({
        schema,
        plugins: [
            ApolloServerPluginDrainHttpServer({ httpServer })
        ],
        introspection: true
    });
    await server.start();
    app.use(
        gqlPath,
        cors<cors.CorsRequest>(),
        jwt({
            secret: jwksRsa.expressJwtSecret({
                cache: true,
                // rateLimit: true,
                // jwksRequestsPerMinute: 5,
                jwksUri: `https://${config.auth0.auth0_domain}/.well-known/jwks.json`
            }) as GetVerificationKey,
            algorithms: ['RS256'],
            issuer: `https://${config.auth0.auth0_domain}/`,
            audience: config.auth0.auth0_audience,
            credentialsRequired: false,
        }),
        json(),
        expressMiddleware(server, {
            context: async ({ req, res }: { req: Request & { auth?: Auth }, res: Response }) => {
                if (req.auth) {
                    console.log(`DEBUG - RLS Enabled - req.auth: ${JSON.stringify(req.auth, null, 2)}`)
                    // const rlsAuthExtension = rlsAuthExtensionFactory(req.auth["https://dev.datasteward.ai/claims"].id);
                    // const rlsClient = prisma.$extends(rlsAuthExtension);
                    const context: Context = {
                        req,
                        auth: req.auth,
                        prisma: prisma,
                    };
                    return context;
                // support passthrough GET requests to the /graphql endpoint
                } else if (req.method === 'GET') {
                    const context: Context = {
                        req,
                        auth: undefined,
                        prisma: prisma,
                    };
                    return context;
                } else if (config.auth0.auth0_enabled && !req.auth) {
                    throw new Error('Unauthorized');
                } else {
                    const context: Context = {
                        req,
                        auth: undefined,
                        prisma: prisma,
                    };
                    return context;
                }
                
            }
        }),
    );

    
    app.use(Sentry.expressErrorHandler());
    

    return () => {
        app.listen({ port: config.api.port, hostname: '0.0.0.0' }, () =>
            console.log(`🚀 Server ready at http://localhost:${config.api.port}${gqlPath}`),
        );
    }
}

main().then((app) => {
    app();
})