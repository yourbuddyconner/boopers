import { config, prisma, rootLogger } from '../../lib/config';
import { ObjectType, Field, Resolver, Query, Arg, Mutation, buildSchema, NonEmptyArray } from "type-graphql";

export async function auth0LoginHook(email: string) {
    const logger = rootLogger.child({ module: 'auth0LoginHook' });
    logger.debug(`login hook called with email ${email}`)
    const user = await prisma.user.findUnique({
        where: {
            email: email
        }
    });

    // if user does not exist, fail 
    if (!user) {
        logger.error(`Unsuccessful login attempt for user ${email}`);
        throw new Error(`User ${email} does not exist, check with your administrator`);
    }


    // ensure email domain is whitelisted
    // const whitelistedDomains = org.whitelistedDomains;
    // const emailDomain = email.split('@')[1];
    // if (!whitelistedDomains.includes(emailDomain)) {
    //     throw new Error(`Email domain ${emailDomain} is not whitelisted for organization ${org.name}`);
    // }
    
    // if user exists, they are logging in again
    // update their last login time
    else {
        const updatedUser = await prisma.user.update({
            where: {
                email: email
            },
            data: {
                lastLogin: new Date()
            }
        });
        logger.debug(`Updated last login for user ${updatedUser.email}`);
    }
    // return the email and role set
    const payload = {
        email: email,
        id: user.id,
    };
    logger.debug(`Returning payload ${JSON.stringify(payload, null, 2)}`)
    return payload;
}

@ObjectType()
class Auth0LoginResponse {
    @Field()
    email: string;
    id: number;
    // orgId: number;
    // roles: string[];
    // scopes: string[];
}

@Resolver()
export class Auth0Resolver {
    // TODO: Figure out how to properly authorize this
    // Auth0 won't be including a JWT token in the request
    @Mutation(() => Auth0LoginResponse)
    async auth0Login(
        @Arg("email") email: string,
        @Arg("auth0HookSecret") auth0HookSecret: string
    ): Promise<Auth0LoginResponse> {
        // check auth0 token
        if (auth0HookSecret !== config.auth0.auth0_hook_secret) {
            throw new Error(`Invalid auth0 hook secret`);
        }
        const response = await auth0LoginHook(email);
        return response;
    }
}