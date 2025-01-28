import {
  CloudWatchLogsClient,
  PutDeliverySourceCommand,
  PutDeliveryDestinationCommand,
  CreateDeliveryCommand,
  DeleteDeliveryCommand,
  DeleteDeliverySourceCommand,
  DeleteDeliveryDestinationCommand,
  Delivery,
  UpdateDeliveryConfigurationCommand,
  OutputFormat,
} from "@aws-sdk/client-cloudwatch-logs";
import { CdkCustomResourceEvent, CdkCustomResourceHandler } from "aws-lambda";

// Constants
const DEFAULT_OUTPUT_FORMAT = OutputFormat.PARQUET;

// Types
interface ResourceProperties {
  ServiceToken: string;
  DistributionId: string;
  DistributionArn: string;
  BucketArn: string;
  LogPrefix: string;
  OutputFormat?: OutputFormat;
}

interface LoggingConfiguration {
  sourceName: string;
  destinationName: string;
  outputFormat: OutputFormat;
}

/**
 * Configure CloudFront standard logging V2
 */
export const handler: CdkCustomResourceHandler = async (
  event: CdkCustomResourceEvent
) => {
  const props = event.ResourceProperties as unknown as ResourceProperties;
  const config = createLoggingConfiguration(props);
  try {
    if (event.RequestType === "Create") {
      const delivery = await setupLogging(props, config);

      return {
        PhysicalResourceId: delivery.id,
        Data: {
          DeliveryArn: delivery.arn,
        },
      };
    } else if (event.RequestType === "Update") {
      const deliveryId = event.PhysicalResourceId;
      await updateLogging(props, deliveryId);

      return {
        PhysicalResourceId: deliveryId,
      };
    } else if (event.RequestType === "Delete") {
      const deliveryId = event.PhysicalResourceId;
      await cleanupLogging(config, deliveryId);
      return {};
    } else {
      throw Error(`Unexpected request types`);
    }
  } catch (error) {
    console.error("Error handling CloudFront logging configuration:", {
      requestType: event.RequestType,
      error,
    });
    throw error;
  }
};

/**
 * Create logging configuration from properties
 */
const createLoggingConfiguration = (
  props: ResourceProperties
): LoggingConfiguration => {
  const MAX_DELIVERY_DESTINATION_NAME_LENGTH = 60;
  const DELIVERY_DESTINATION_PREFIX = "cf-";
  const DELIVERY_DESTINATION_DELIMITER = "-";
  const distributionId = props.DistributionId;
  const bucketName = props.BucketArn.replace(/^arn:aws:s3:::/, "");

  // Calculate maximum length for bucket name
  const maxBucketNameLength =
    MAX_DELIVERY_DESTINATION_NAME_LENGTH -
    DELIVERY_DESTINATION_PREFIX.length -
    DELIVERY_DESTINATION_DELIMITER.length -
    distributionId.length;
  const truncatedBucketName = bucketName.substring(0, maxBucketNameLength);

  return {
    sourceName: `cf-${distributionId}`,
    destinationName: `${DELIVERY_DESTINATION_PREFIX}${distributionId}${DELIVERY_DESTINATION_DELIMITER}${truncatedBucketName}`,
    outputFormat: props.OutputFormat ?? DEFAULT_OUTPUT_FORMAT,
  };
};

/**
 * Setup CloudFront logging with delivery source and destination
 */
const setupLogging = async (
  props: ResourceProperties,
  config: LoggingConfiguration
): Promise<Delivery> => {
  const logs = new CloudWatchLogsClient({});

  // 1. Create delivery source
  await logs.send(
    new PutDeliverySourceCommand({
      name: config.sourceName,
      resourceArn: props.DistributionArn,
      logType: "ACCESS_LOGS",
    })
  );

  // 2. Create delivery destination
  const dutDeliveryDestinationCommandOutput = await logs.send(
    new PutDeliveryDestinationCommand({
      name: config.destinationName,
      outputFormat: config.outputFormat,
      deliveryDestinationConfiguration: {
        destinationResourceArn: props.BucketArn,
      },
    })
  );

  if (!dutDeliveryDestinationCommandOutput.deliveryDestination?.arn) {
    throw new Error("Failed to create delivery destination");
  }

  // 3. Create delivery
  const createDeliveryCommandOutput = await logs.send(
    new CreateDeliveryCommand({
      deliverySourceName: config.sourceName,
      deliveryDestinationArn:
        dutDeliveryDestinationCommandOutput.deliveryDestination.arn,
      s3DeliveryConfiguration: {
        enableHiveCompatiblePath: false,
        suffixPath: props.LogPrefix,
      },
    })
  );

  if (!createDeliveryCommandOutput.delivery) {
    throw new Error("Failed to create delivery");
  }

  return createDeliveryCommandOutput.delivery;
};

/**
 * Update CloudFront logging configuration
 */
const updateLogging = async (
  props: ResourceProperties,
  deliveryId: string
): Promise<void> => {
  const logs = new CloudWatchLogsClient({});

  await logs.send(
    new UpdateDeliveryConfigurationCommand({
      id: deliveryId,
      s3DeliveryConfiguration: {
        enableHiveCompatiblePath: false,
        suffixPath: props.LogPrefix,
      },
    })
  );
};

/**
 * Cleanup CloudFront logging configuration
 */
const cleanupLogging = async (
  config: LoggingConfiguration,
  deliveryId: string
): Promise<void> => {
  const logs = new CloudWatchLogsClient({});

  try {
    // 1. Delete delivery
    await logs.send(
      new DeleteDeliveryCommand({
        id: deliveryId,
      })
    );

    // 2. Delete delivery source
    await logs.send(
      new DeleteDeliverySourceCommand({
        name: config.sourceName,
      })
    );

    // 3. Delete delivery destination
    await logs.send(
      new DeleteDeliveryDestinationCommand({
        name: config.destinationName,
      })
    );
  } catch (error) {
    console.error("Error cleaning up CloudFront logging:", error);
    throw error;
  }
};
