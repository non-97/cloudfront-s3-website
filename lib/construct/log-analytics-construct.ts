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
  databaseName: string;
}

interface CreateTableProperty {
  databaseName: string;
  logType: LogType;
  locationPlaceHolder: {
    logBucketName: string;
    logSrcResourceAccountId: string;
    logSrcResourceId?: string;
    logSrcResourceRegion?: string;
    prefix?: string;
  };
}

const s3ServerAccessLog: LogTable = {
  location:
    "s3://#{logBucketName}/#{prefix}#{logSrcResourceAccountId}/#{logSrcResourceRegion}/#{logSrcResourceId}",
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

const cloudFrontStandardLogLegacy: LogTable = {
  location:
    "s3://#{logBucketName}/#{prefix}partitioned/#{logSrcResourceAccountId}/#{logSrcResourceId}",
  storageLocationTemplate: "#{location}/${date}",
  tableInput: {
    name: "cloudfront_access_log",
    tableType: "EXTERNAL_TABLE",
    storageDescriptor: {
      columns: [
        { name: "log_date", type: "date" },
        { name: "time", type: "string" },
        { name: "x_edge_location", type: "string" },
        { name: "sc_bytes", type: "bigint" },
        { name: "c_ip", type: "string" },
        { name: "cs_method", type: "string" },
        { name: "cs_host", type: "string" },
        { name: "cs_uri_stem", type: "string" },
        { name: "sc_status", type: "int" },
        { name: "cs_referer", type: "string" },
        { name: "cs_user_agent", type: "string" },
        { name: "cs_uri_query", type: "string" },
        { name: "cs_cookie", type: "string" },
        { name: "x_edge_result_type", type: "string" },
        { name: "x_edge_request_id", type: "string" },
        { name: "x_host_header", type: "string" },
        { name: "cs_protocol", type: "string" },
        { name: "cs_bytes", type: "bigint" },
        { name: "time_taken", type: "float" },
        { name: "x_forwarded_for", type: "string" },
        { name: "ssl_protocol", type: "string" },
        { name: "ssl_cipher", type: "string" },
        { name: "x_edge_response_result_type", type: "string" },
        { name: "cs_protocol_version", type: "string" },
        { name: "fle_status", type: "string" },
        { name: "fle_encrypted_fields", type: "string" },
        { name: "c_port", type: "int" },
        { name: "time_to_first_byte", type: "float" },
        { name: "x_edge_detailed_result_type", type: "string" },
        { name: "sc_content_type", type: "string" },
        { name: "sc_content_len", type: "bigint" },
        { name: "sc_range_start", type: "bigint" },
        { name: "sc_range_end", type: "bigint" },
      ],
      inputFormat: "org.apache.hadoop.mapred.TextInputFormat",
      outputFormat:
        "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
      serdeInfo: {
        serializationLibrary:
          "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe",
        parameters: {
          "field.delim": "\t",
          "serialization.format": "\t",
        },
      },
    },
    parameters: {
      has_encrypted_data: true,
      "skip.header.line.count": "2",
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

const cloudFrontStandardLogV2: LogTable = {
  location:
    "s3://#{logBucketName}/AWSLogs/#{logSrcResourceAccountId}/CloudFront/#{prefix}#{logSrcResourceId}",
  storageLocationTemplate: "#{location}/${partition_date}",
  tableInput: {
    name: "cloudfront_access_log",
    tableType: "EXTERNAL_TABLE",
    storageDescriptor: {
      columns: [
        { name: "date", type: "string" },
        { name: "time", type: "string" },
        { name: "x_edge_location", type: "string" },
        { name: "sc_bytes", type: "string" },
        { name: "c_ip", type: "string" },
        { name: "cs_method", type: "string" },
        { name: "cs_host", type: "string" },
        { name: "cs_uri_stem", type: "string" },
        { name: "sc_status", type: "string" },
        { name: "cs_referer", type: "string" },
        { name: "cs_user_agent", type: "string" },
        { name: "cs_uri_query", type: "string" },
        { name: "cs_cookie", type: "string" },
        { name: "x_edge_result_type", type: "string" },
        { name: "x_edge_request_id", type: "string" },
        { name: "x_host_header", type: "string" },
        { name: "cs_protocol", type: "string" },
        { name: "cs_bytes", type: "string" },
        { name: "time_taken", type: "string" },
        { name: "x_forwarded_for", type: "string" },
        { name: "ssl_protocol", type: "string" },
        { name: "ssl_cipher", type: "string" },
        { name: "x_edge_response_result_type", type: "string" },
        { name: "cs_protocol_version", type: "string" },
        { name: "fle_status", type: "string" },
        { name: "fle_encrypted_fields", type: "string" },
        { name: "c_port", type: "string" },
        { name: "time_to_first_byte", type: "string" },
        { name: "x_edge_detailed_result_type", type: "string" },
        { name: "sc_content_type", type: "string" },
        { name: "sc_content_len", type: "string" },
        { name: "sc_range_start", type: "string" },
        { name: "sc_range_end", type: "string" },
      ],
      inputFormat:
        "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
      outputFormat:
        "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
      serdeInfo: {
        serializationLibrary:
          "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe",
      },
    },
    parameters: {
      has_encrypted_data: true,
      classification: "parquet",
      "projection.enabled": true,
      "projection.partition_date.type": "date",
      "projection.partition_date.interval": "1",
      "projection.partition_date.interval.unit": "DAYS",
      "projection.partition_date.range": "NOW-1YEARS, NOW+9HOUR",
      "projection.partition_date.format": "yyyy/MM/dd",
    },
    partitionKeys: [{ name: "partition_date", type: "string" }],
  },
};

const logTables: LogTables = {
  s3ServerAccessLog,
  cloudFrontStandardLogLegacy: cloudFrontStandardLogLegacy,
  cloudFrontStandardLogV2: cloudFrontStandardLogV2,
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
    id: string,
    props: CreateDatabaseProperty
  ): cdk.aws_glue.CfnDatabase => {
    return new cdk.aws_glue.CfnDatabase(this, id, {
      catalogId: cdk.Stack.of(this).account,
      databaseInput: {
        name: props.databaseName,
      },
    });
  };

  public createTable = (id: string, props: CreateTableProperty) => {
    props.locationPlaceHolder.prefix = props.locationPlaceHolder.prefix
      ? `${props.locationPlaceHolder.prefix}/`
      : "";

    const logTable = logTables[props.logType];
    const tableInput = logTable.tableInput;

    const location = this.replacePlaceholders(
      logTable.location,
      props.locationPlaceHolder
    );
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

    new cdk.aws_glue.CfnTable(this, id, {
      databaseName: props.databaseName,
      catalogId: cdk.Stack.of(this).account,
      tableInput: mergedTableInput,
    });
  };

  private getPlaceholders = (template: string): string[] => {
    const placeholderRegex = /#{([^}]+)}/g;
    const placeholders: string[] = [];
    let match;

    while ((match = placeholderRegex.exec(template)) !== null) {
      placeholders.push(match[1]);
    }
    return placeholders;
  };

  private replacePlaceholders = (
    template: string,
    props: Record<string, string>
  ): string => {
    const placeholders = this.getPlaceholders(template);
    let result = template;

    for (const placeholder of placeholders) {
      if (props.hasOwnProperty(placeholder)) {
        result = result.replace(
          new RegExp(`#{${placeholder}}`, "g"),
          props[placeholder]
        );
      } else {
        throw new Error(`Placeholder not replaced: #{${placeholder}}`);
      }
    }

    return result;
  };
}
