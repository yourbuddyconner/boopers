import { PrismaClient } from "@prisma/client";
import { Request } from "express";


export interface Auth {
    // openid claims
    iss: string;
    sub: string;
    aud: string[];
    iat: number;
    exp: number;
    azp: string;
    at_hash: string;
    scope: string;
    org_id?: string;
    // custom claims
    // "https://teachprotege.ai/claims": ProtgeClaims;
}


export interface Context {
    req: Request;
    auth: Auth;
    prisma: PrismaClient;
}