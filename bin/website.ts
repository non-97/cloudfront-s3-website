#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { WebsiteStack } from "../lib/website-stack";
import { websiteStackProperty } from "../parameter/index";

const app = new cdk.App();
new WebsiteStack(app, "WebsiteStack", {
  env: websiteStackProperty.env,
  ...websiteStackProperty.props,
});
