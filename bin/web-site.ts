#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { WebSiteStack } from "../lib/web-site-stack";
import { webSiteStackProperty } from "../parameter/index";

const app = new cdk.App();
new WebSiteStack(app, "WebSiteStack", {
  env: webSiteStackProperty.env,
  ...webSiteStackProperty.props,
});
