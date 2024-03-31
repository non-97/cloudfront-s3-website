import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { LogAnalytics, LogType } from "../../parameter/index";
import { BucketConstruct } from "./bucket-construct";

interface LogTable {
  location: string;
  storageLocationTemplate?: string;
  tableInput: cdk.aws_glue.CfnTable.TableInputProperty;
}

type LogTables = {
  [key in LogType]: LogTable;
};

interface CreateDatabaseProperty {
  scope: Construct;
  id: string;
  databaseName: string;
}

interface CreateTableProperty {
  scope: Construct;
  id: string;
  databaseName: string;
  logType: LogType;
  logDstBucketName: string;
  logSrcBucketName: string;
  logFilePrefix?: string;
}

const s3ServerAccessLog: LogTable = {
  location:
    "s3://#{logDstBucketName}/#{prefix}#{accountId}/#{region}/#{logSrcBucketName}",
  storageLocationTemplate: "#{location}/${date}",
  tableInput: {
    name: "s3_server_access_log",
    tableType: "EXTERNAL_TABLE",
    storageDescriptor: {
      columns: [
        { name: "bucketowner", type: "string" },
        { name: "bucket_name", type: "string" },
        { name: "requestdatetime", type: "string" },
        { name: "remoteip", type: "string" },
        { name: "requester", type: "string" },
        { name: "requestid", type: "string" },
        { name: "operation", type: "string" },
        { name: "key", type: "string" },
        { name: "request_uri", type: "string" },
        { name: "httpstatus", type: "string" },
        { name: "errorcode", type: "string" },
        { name: "bytessent", type: "bigint" },
        { name: "objectsize", type: "bigint" },
        { name: "totaltime", type: "string" },
        { name: "turnaroundtime", type: "string" },
        { name: "referrer", type: "string" },
        { name: "useragent", type: "string" },
        { name: "versionid", type: "string" },
        { name: "hostid", type: "string" },
        { name: "sigv", type: "string" },
        { name: "ciphersuite", type: "string" },
        { name: "authtype", type: "string" },
        { name: "endpoint", type: "string" },
        { name: "tlsversion", type: "string" },
        { name: "accesspointarn", type: "string" },
        { name: "aclrequired", type: "string" },
      ],
      inputFormat: "org.apache.hadoop.mapred.TextInputFormat",
      outputFormat:
        "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
      serdeInfo: {
        serializationLibrary: "org.apache.hadoop.hive.serde2.RegexSerDe",
        parameters: {
          "input.regex":
            '([^ ]*) ([^ ]*) \\[(.*?)\\] ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ("[^"]*"|-) (-|[0-9]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ("[^"]*"|-) ([^ ]*)(?: ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*))?.*$',
        },
      },
    },
    parameters: {
      "skip.header.line.count": "1",
      has_encrypted_data: true,
      "projection.enabled": true,
      "projection.date.type": "date",
      "projection.date.interval": "1",
      "projection.date.interval.unit": "DAYS",
      "projection.date.range": "NOW-1YEARS, NOW+9HOUR",
      "projection.date.format": "yyyy/MM/dd",
    },
    partitionKeys: [{ name: "date", type: "string" }],
  },
};

const logTables: LogTables = {
  s3ServerAccessLog,
};

export interface LogAnalyticsConstructProps extends LogAnalytics {
  queryOutputBucketConstruct?: BucketConstruct;
}

export class LogAnalyticsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: LogAnalyticsConstructProps) {
    super(scope, id);

    if (!props.queryOutputBucketConstruct) {
      return;
    }

    new cdk.aws_athena.CfnWorkGroup(this, "WorkGroup", {
      name: `workgroup-log-analytics-${cdk.Lazy.string({
        produce: () => cdk.Names.uniqueId(this),
      })}`,
      recursiveDeleteOption: true,
      state: "ENABLED",
      workGroupConfiguration: {
        bytesScannedCutoffPerQuery: 1073741824,
        enforceWorkGroupConfiguration: false,
        publishCloudWatchMetricsEnabled: true,
        requesterPaysEnabled: false,
        resultConfiguration: {
          outputLocation:
            props.queryOutputBucketConstruct.bucket.s3UrlForObject(),
        },
      },
    });
  }

  public createDatabase = (
    props: CreateDatabaseProperty
  ): cdk.aws_glue.CfnDatabase => {
    return new cdk.aws_glue.CfnDatabase(this, props.id, {
      catalogId: cdk.Stack.of(this).account,
      databaseInput: {
        name: props.databaseName,
      },
    });
  };

  public createTable = (props: CreateTableProperty) => {
    const accountId = cdk.Stack.of(props.scope).account;
    const region = cdk.Stack.of(props.scope).region;
    const prefix = props.logFilePrefix ? `${props.logFilePrefix}/` : "";

    const logTable = logTables[props.logType];
    const tableInput = logTable.tableInput;
    const location = logTable.location
      .replace("#{logDstBucketName}", props.logDstBucketName)
      .replace("#{prefix}", prefix)
      .replace("#{accountId}", accountId)
      .replace("#{region}", region)
      .replace("#{logSrcBucketName}", props.logSrcBucketName);
    const storageLocationTemplate = logTable.storageLocationTemplate?.replace(
      "#{location}",
      location
    );

    const mergedTableInput: cdk.aws_glue.CfnTable.TableInputProperty = {
      ...tableInput,
      storageDescriptor: {
        ...tableInput.storageDescriptor,
        location,
      },
      parameters: {
        ...tableInput.parameters,
        "storage.location.template": storageLocationTemplate,
      },
    };

    new cdk.aws_glue.CfnTable(this, props.id, {
      databaseName: props.databaseName,
      catalogId: cdk.Stack.of(this).account,
      tableInput: mergedTableInput,
    });
  };
}
