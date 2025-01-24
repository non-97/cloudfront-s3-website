import * as cdk from "aws-cdk-lib";
import * as path from "path";

export type LogType = "s3ServerAccessLog" | "cloudFrontAccessLog";

export interface LifecycleRule {
  prefix?: string;
  expirationDays: number;
  ruleNameSuffix?: string;
  abortIncompleteMultipartUploadAfter?: cdk.Duration;
}

export interface LogAnalytics {
  createWorkGroup?: boolean;
  enableLogAnalytics?: LogType[];
}

export interface AccessLog {
  enableAccessLog?: boolean;
  logFilePrefix?: string;
  lifecycleRules?: LifecycleRule[];
}

export interface HostZoneProperty {
  zoneName?: string;
  hostedZoneId?: string;
}

export interface CertificateProperty {
  certificateArn?: string;
  certificateDomainName?: string;
}

export interface ContentsDeliveryProperty {
  domainName?: string;
  contentsPath?: string;
  enableDirectoryIndex?: "cf2" | "lambdaEdge" | false;
  enableRewriteToWebp?: "cf2" | "lambdaEdge" | false;
  enableS3ListBucket?: boolean;
}

export interface WebsiteProperty {
  hostedZone?: HostZoneProperty;
  certificate?: CertificateProperty;
  contentsDelivery?: ContentsDeliveryProperty;
  allowDeleteBucketAndObjects?: boolean;
  s3ServerAccessLog?: AccessLog;
  cloudFrontAccessLog?: AccessLog;
  logAnalytics?: LogAnalytics;
}

export interface WebSiteStackProperty {
  env?: cdk.Environment;
  props: WebsiteProperty;
}

export const websiteStackProperty: WebSiteStackProperty = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  props: {
    hostedZone: {
      zoneName: "www.non-97.net",
    },
    certificate: {
      certificateDomainName: "www.non-97.net",
    },
    contentsDelivery: {
      domainName: "www.non-97.net",
      contentsPath: path.join(__dirname, "../lib/src/contents"),
      enableDirectoryIndex: "cf2",
      enableRewriteToWebp: "lambdaEdge",
      enableS3ListBucket: true,
    },
    allowDeleteBucketAndObjects: true,
    s3ServerAccessLog: {
      enableAccessLog: true,
      lifecycleRules: [{ expirationDays: 365 }],
    },
    cloudFrontAccessLog: {
      enableAccessLog: true,
      lifecycleRules: [{ expirationDays: 365 }],
    },
    logAnalytics: {
      createWorkGroup: true,
      enableLogAnalytics: ["s3ServerAccessLog", "cloudFrontAccessLog"],
    },
  },
};
