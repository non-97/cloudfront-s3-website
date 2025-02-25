import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { WafProperty } from "../../parameter/index";

export interface WafConstructProps extends WafProperty {}

export class WafConstruct extends Construct {
  readonly webAcl: cdk.aws_wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: WafConstructProps) {
    super(scope, id);

    const logGroup = new cdk.aws_logs.LogGroup(scope, "LogGroup", {
      logGroupName: `aws-waf-logs-${props.webAclName}`,
      retention: cdk.aws_logs.RetentionDays.ONE_YEAR,
    });

    const webAcl = new cdk.aws_wafv2.CfnWebACL(this, "Default", {
      name: props.webAclName,
      scope: "CLOUDFRONT",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: props.webAclName,
      },
      rules: [
        {
          name: `RateLimit_SameIPSameURI`,
          priority: 10,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 10,
              aggregateKeyType: "CUSTOM_KEYS",
              evaluationWindowSec: 60,
              customKeys: [
                {
                  uriPath: {
                    textTransformations: [
                      {
                        type: "NONE",
                        priority: 0,
                      },
                    ],
                  },
                },
                {
                  ip: {},
                },
              ],
              scopeDownStatement: {
                regexMatchStatement: {
                  fieldToMatch: {
                    uriPath: {},
                  },
                  textTransformations: [
                    {
                      type: "NONE",
                      priority: 0,
                    },
                  ],
                  regexString: ".*/$|^$",
                },
              },
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: "RateLimit_SameIPSameURI",
          },
          ruleLabels: [
            {
              name: "RateLimit_SameIPSameURI",
            },
          ],
        },
        {
          name: "AWSManagedRulesCommonRuleSet",
          priority: 50,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: "AWSManagedRulesCommonRuleSet",
          },
        },
        {
          name: "AWSManagedRulesKnownBadInputsRuleSet",
          priority: 51,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesKnownBadInputsRuleSet",
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: "AWSManagedRulesKnownBadInputsRuleSet",
          },
        },
        {
          name: "AWSManagedRulesAmazonIpReputationList",
          priority: 52,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesAmazonIpReputationList",
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: "AWSManagedRulesAmazonIpReputationList",
          },
        },
        {
          name: "AWSManagedRulesAnonymousIpList",
          priority: 53,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesAnonymousIpList",
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: "AWSManagedRulesAnonymousIpList",
          },
        },
      ],
    });

    this.webAcl = webAcl;

    new cdk.aws_wafv2.CfnLoggingConfiguration(scope, "LoggingConfiguration", {
      logDestinationConfigs: [
        `arn:aws:logs:${cdk.Stack.of(this).region}:${
          cdk.Stack.of(this).account
        }:log-group:${logGroup.logGroupName}`,
      ],
      resourceArn: this.webAcl.attrArn,
      loggingFilter: {
        DefaultBehavior: "DROP",
        Filters: [
          {
            Behavior: "KEEP",
            Conditions: [
              {
                ActionCondition: {
                  Action: "BLOCK",
                },
              },
              {
                ActionCondition: {
                  Action: "COUNT",
                },
              },
            ],
            Requirement: "MEETS_ANY",
          },
        ],
      },
    });
  }
}
