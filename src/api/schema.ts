import { NonEmptyArray } from "type-graphql";
import { genResolvers } from "./resolvers/generated";

export const resolvers: NonEmptyArray<Function> = [
  ...genResolvers as NonEmptyArray<Function>,
];
