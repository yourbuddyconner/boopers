import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Router } from 'express';
import { ManagementClient } from 'auth0';
import pino from 'pino';

dotenv.config();

/**
* Config file
*/
export const config: {
  env: {
    environment: string,
    tenant_name:  string,
  },
  logging: {
    level: string,
    pretty_print: boolean,
    root_name: string,
  },
  aws: {
    aws_access_key_id: string,
    aws_secret_access_key:string,
    aws_region: string,
    attachments_bucket_name: string,
  },
  auth0: {
    auth0_enabled: boolean,
    auth0_domain: string,
    auth0_client_id: string,
    auth0_machine_client_id: string,
    auth0_machine_client_secret: string,
    auth0_google_auth_connection: string,
    auth0_hook_secret: string,
    auth0_audience: string,
  },
  protege: {
    endpoint: string,
    api_key: string,
    default_model_backend: string,
    prompt_template: string,
  },
  api: {
    port: number,
    graphql_path: string,
    cors_origin: string,
    jwt_claim_namespace: string,
  },
  temporal: {
    temporal_server: string,
    temporal_certificate: string,
    temporal_private_key: string,
    temporal_worker_task_queue: string
    temporal_namespace: string,
  },
  email: {
    imap_host: string,
    imap_port: number,
    imap_user: string,
    imap_pass: string,
    smtp_host: string,
    smtp_port: number,
    smtp_user: string,
    smtp_pass: string,
  },
  tracing: {
    api_tracing_enabled: boolean,
    job_tracing_enabled: boolean,
    otlp_endpoint: string,
    service_name: string,
    service_version: string,
  },
  sentry: {
    sentry_dsn: string,
  },
} = {
  env: {
    environment: process.env.NODE_ENV ?? 'development',
    tenant_name: process.env.TENANT_NAME ?? 'dev',
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'debug',
    pretty_print: process.env.LOG_PRETTY_PRINT === 'TRUE' ? true : false,
    root_name: process.env.LOG_ROOT_NAME ?? 'data-steward',
  },
  aws: {
    aws_access_key_id: process.env.AWS_ACCESS_KEY_ID ?? '',
    aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    aws_region: process.env.AWS_REGION ?? 'us-east-1',
    attachments_bucket_name: process.env.ATTACHMENTS_BUCKET_NAME ?? 'dev-data-steward',
  },
  auth0: {
    auth0_enabled: process.env.AUTH0_ENABLED === 'TRUE' ? true : false,
    auth0_domain: process.env.AUTH0_DOMAIN ?? '',
    auth0_client_id: process.env.AUTH0_CLIENT_ID ?? '',
    auth0_machine_client_id: process.env.AUTH0_MACHINE_CLIENT_ID ?? '',
    auth0_machine_client_secret: process.env.AUTH0_MACHINE_CLIENT_SECRET ?? '',
    auth0_google_auth_connection: process.env.AUTH0_GOOGLE_AUTH_CONNECTION ?? '',
    auth0_hook_secret: process.env.AUTH0_HOOK_SECRET ?? '',
    auth0_audience: process.env.AUTH0_AUDIENCE ?? '',
  },
  protege: {
    endpoint: process.env.PROTEGE_ENDPOINT ?? 'https://api.engine.teachprotege.ai/v3/graphql',
    api_key: process.env.PROTEGE_API_KEY ?? 'five-dollar-footlong',
    default_model_backend: process.env.PROTEGE_MODEL_BACKEND ?? 'data-steward',
    prompt_template: process.env.PROTEGE_PROMPT_TEMPLATE ?? 'chatml',
  },
  api: {
    port: parseInt(process.env.PORT ?? '3000'),
    graphql_path: process.env.GRAPHQL_PATH ?? '/v3/graphql',
    cors_origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    jwt_claim_namespace: process.env.JWT_CLAIM_NAMESPACE ?? `https://${process.env.TENANT_NAME}.datasteward.ai/claims`,
  },
  temporal: {
    temporal_server: process.env.TEMPORAL_SERVER ?? 'localhost:7233',
    temporal_certificate: process.env.TEMPORAL_CERTIFICATE ?? '',
    temporal_private_key: process.env.TEMPORAL_PRIVATE_KEY ?? '',
    temporal_worker_task_queue: process.env.TEMPORAL_WORKER_TASK_QUEUE ?? 'data-steward',
    temporal_namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
  },
  email: {
    imap_host: process.env.IMAP_HOST ?? 'localhost',
    imap_port: parseInt(process.env.IMAP_PORT ?? '143'),
    imap_user: process.env.IMAP_USER ?? '',
    imap_pass: process.env.IMAP_PASS ?? '',
    smtp_host: process.env.SMTP_HOST ?? 'localhost',
    smtp_port: parseInt(process.env.SMTP_PORT ?? '1025'),
    smtp_user: process.env.SMTP_USER ?? '',
    smtp_pass: process.env.SMTP_PASS ?? '',
  },
  tracing: {
    api_tracing_enabled: process.env.API_TRACING_ENABLED === 'TRUE' ? true : false,
    job_tracing_enabled: process.env.JOB_TRACING_ENABLED === 'TRUE' ? true : false,
    otlp_endpoint: process.env.OTLP_ENDPOINT ?? 'http://localhost:4318',
    service_name: process.env.SERVICE_NAME ?? 'data-steward',
    service_version: process.env.SERVICE_VERSION ?? '0.0.1',
  },
  sentry: {
    sentry_dsn: process.env.SENTRY_DSN ?? '',
  },
}

// set up logging
const transportConf = [];
if (config.env.environment === 'development') {
  // pretty-printed logs to stdout
  transportConf.push({
    target: 'pino-pretty',
    options: { destination: 1 },
    level: 'debug'
  })
} else {
  // JSON logs to stdout
  transportConf.push({
    target: 'pino/file',
    options: { destination: 1 },
  })
}
const transports = pino.transport({ targets: transportConf });
export const rootLogger = pino({ name: config.logging.root_name, level: config.logging.level }, transports);
const logger = rootLogger.child({ module: 'config' });


// if (config.env.environment === 'development') {
//   logger.info('Development environment');
// }


const prisma = new PrismaClient()

function sentryInit(app?: Router): void {
  let integrations = []
  if (config.tracing.api_tracing_enabled) {
    logger.debug(`DEBUG -- sentryInit: enabling API Tracing with sentry`)
    integrations = [
      nodeProfilingIntegration(),
      // new Sentry.Integrations.Http({ tracing: true }),
      // new Sentry.Integrations.Express({ app }),
      // new Sentry.Integrations.Prisma({ client: prisma }),
      // new Sentry.Integrations.GraphQL(),
      // new Sentry.Integrations.Apollo(),
      // new Sentry.Integrations.OnUncaughtException({ onFatalError: () => Sentry.getCurrentHub().getClient()?.flush(2000) }),

    ]
  }
  Sentry.init({
    dsn: config.sentry.sentry_dsn,
    integrations: integrations,
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
  })
}

export { prisma, sentryInit };

export function auth0() {
  return new ManagementClient({
    domain: config.auth0.auth0_domain,
    clientId: config.auth0.auth0_machine_client_id,
    clientSecret: config.auth0.auth0_machine_client_secret,
    audience: `https://${config.auth0.auth0_domain}/api/v2/`,
  });
}