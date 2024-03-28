import * as cdk from "aws-cdk-lib";
import * as path from "path";

export interface LifecycleRule {
  prefix?: string;
  expirationDays: number;
  ruleNameSuffix?: string;
  abortIncompleteMultipartUploadAfter?: cdk.Duration;
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
  enableDirectoryIndex?: boolean;
}

export interface WebSiteProperty {
  hostedZone?: HostZoneProperty;
  certificate?: CertificateProperty;
  contentsDelivery?: ContentsDeliveryProperty;
  allowDeleteBucketAndObjects?: boolean;
  s3ServerAccessLog?: AccessLog;
  cloudFrontAccessLog?: AccessLog;
}

export interface WebSiteStackProperty {
  env?: cdk.Environment;
  props: WebSiteProperty;
}

export const webSiteStackProperty: WebSiteStackProperty = {
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
      enableDirectoryIndex: true,
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
  },
};
