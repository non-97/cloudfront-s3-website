import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { WebsiteProperty, LogType } from "../parameter/index";
import { HostedZoneConstruct } from "./construct/hosted-zone-construct";
import { CertificateConstruct } from "./construct/certificate-construct";
import { WafConstruct } from "./construct/waf-construct";
import { BucketConstruct } from "./construct/bucket-construct";
import { ContentsDeliveryConstruct } from "./construct/contents-delivery-construct";
import { LogAnalyticsConstruct } from "./construct/log-analytics-construct";

export interface WebsiteStackProps extends cdk.StackProps, WebsiteProperty {}

export class WebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    // Public Hosted Zone
    const hostedZoneConstruct = props.hostedZone
      ? new HostedZoneConstruct(this, "HostedZoneConstruct", {
          ...props.hostedZone,
        })
      : undefined;

    // ACM Certificate
    const certificateConstruct = props.certificate
      ? new CertificateConstruct(this, "CertificateConstruct", {
          ...props.certificate,
          hostedZoneConstruct,
        })
      : undefined;

    // WAF
    const wafConstruct = props.waf
      ? new WafConstruct(this, "WafConstruct", {
          ...props.waf,
        })
      : undefined;

    // Bucket for S3 Server Access Log
    const s3serverAccessLogBucketConstruct = props.s3ServerAccessLog
      ?.enableAccessLog
      ? new BucketConstruct(this, "S3ServerAccessLogBucketConstruct", {
          allowDeleteBucketAndObjects: props.allowDeleteBucketAndObjects,
          accessControl: cdk.aws_s3.BucketAccessControl.LOG_DELIVERY_WRITE,
          ...props.s3ServerAccessLog,
        })
      : undefined;

    // Bucket for CloudFront Access Log
    const cloudFrontAccessLogBucketConstruct = props.cloudFrontAccessLog
      ?.enableAccessLog
      ? new BucketConstruct(this, "CloudFrontAccessLogBucketConstruct", {
          allowDeleteBucketAndObjects: props.allowDeleteBucketAndObjects,
          accessControl: cdk.aws_s3.BucketAccessControl.LOG_DELIVERY_WRITE,
          ...props.cloudFrontAccessLog,
        })
      : undefined;

    // Bucket for Website contents
    const websiteBucketConstruct = new BucketConstruct(
      this,
      "WebsiteBucketConstruct",
      {
        s3ServerAccessLogBucketConstruct: s3serverAccessLogBucketConstruct,
        allowDeleteBucketAndObjects: props.allowDeleteBucketAndObjects,
        logFilePrefix: props.s3ServerAccessLog?.logFilePrefix,
      }
    );

    // CloudFront
    const contentsDeliveryConstruct = new ContentsDeliveryConstruct(
      this,
      "ContentsDeliveryConstruct",
      {
        websiteBucketConstruct: websiteBucketConstruct,
        cloudFrontAccessLogBucketConstruct,
        hostedZoneConstruct,
        certificateConstruct,
        wafConstruct,
        ...props.contentsDelivery,
        ...props.cloudFrontAccessLog,
        ...props.logAnalytics,
      }
    );

    // Log Analytics
    // Athena query output
    const queryOutputBucketConstruct = props.logAnalytics?.createWorkGroup
      ? new BucketConstruct(this, "QueryOutputBucketConstruct", {
          allowDeleteBucketAndObjects: props.allowDeleteBucketAndObjects,
        })
      : undefined;

    const logAnalyticsConstruct = props.logAnalytics
      ? new LogAnalyticsConstruct(this, "LogAnalyticsConstruct", {
          queryOutputBucketConstruct,
        })
      : undefined;

    // Database
    if (!logAnalyticsConstruct) {
      return;
    }
    const database = props.logAnalytics?.enableLogAnalytics
      ? logAnalyticsConstruct?.createDatabase("AccessLogDatabase", {
          databaseName: "access_log",
        })
      : undefined;

    // S3 Server Access Log Table
    if (s3serverAccessLogBucketConstruct && database) {
      logAnalyticsConstruct.createTable("S3ServerAccessLogTable", {
        databaseName: database.ref,
        logType: "s3ServerAccessLog",
        locationPlaceHolder: {
          logBucketName: s3serverAccessLogBucketConstruct.bucket.bucketName,
          logSrcResourceId: websiteBucketConstruct.bucket.bucketName,
          logSrcResourceAccountId: this.account,
          logSrcResourceRegion: this.region,
          prefix: props.s3ServerAccessLog?.logFilePrefix,
        },
      });
    }

    // CloudFront Access Log Table
    if (cloudFrontAccessLogBucketConstruct && database) {
      const cloudFrontLogType = props.logAnalytics?.enableLogAnalytics?.find(
        (
          type
        ): type is "cloudFrontStandardLogLegacy" | "cloudFrontStandardLogV2" =>
          type === "cloudFrontStandardLogLegacy" ||
          type === "cloudFrontStandardLogV2"
      );

      if (!cloudFrontLogType) {
        return;
      }

      logAnalyticsConstruct.createTable("CloudFrontAccessLogTable", {
        databaseName: database.ref,
        logType: cloudFrontLogType,
        locationPlaceHolder: {
          logBucketName: cloudFrontAccessLogBucketConstruct.bucket.bucketName,
          logSrcResourceId:
            contentsDeliveryConstruct.distribution.distributionId,
          logSrcResourceAccountId: this.account,
          logSrcResourceRegion: this.region,
          prefix: props.cloudFrontAccessLog?.logFilePrefix,
        },
      });
    }
  }
}
