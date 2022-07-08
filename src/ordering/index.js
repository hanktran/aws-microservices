import {
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ddbClient } from "./ddbClient";

exports.handler = async function (event) {
  console.log("request", JSON.stringify(event, undefined, 2));

  const eventType = event["detail-type"];
  if (eventType !== undefined) {
    await eventBrideInvocation(event);
  } else {
    return await apiGatewayInvocation(event);
  }
};

const eventBrideInvocation = async (event) => {
  console.log(`eventBridgeInvocation function. event: "${event}"`);

  await createOrder(event.detail);
};

const createOrder = async (basketCheckoutEvent) => {
  try {
    console.log(`createOrder function. event: "${basketCheckoutEvent}"`);

    const orderDate = new Date().toISOString();
    basketCheckoutEvent.orderDate = orderDate;
    console.log(basketCheckoutEvent);

    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: marshall(basketCheckoutEvent || {}),
    };

    const createResult = await ddbClient.send(new PutItemCommand(params));
    console.log(createResult);
    return createResult;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const apiGatewayInvocation = async (event) => {
  let body;
  try {
    switch (event.httpMethod) {
      case "GET":
        if (event.pathParameters !== null) {
          body = await getOrder(event);
        } else {
          body = await getAllOrders();
        }
        break;
      default:
        throw new Error(`Unsported route: "${event.httpMethod}"`);
    }

    console.log(body);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Successfully finished operation: "${event.httpMethod}"`,
        body: body,
      }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to perform operation",
        errorMsg: error.message,
        errorStack: error.stack,
      }),
    };
  }
};

const getOrder = async (event) => {
  console.log("getOrder");

  try {
    // expected request: xxx/order/swn?orderDate=timestamp
    const userName = event.pathParameters.userName;
    const orderDate = event.queryStringParameters.orderDate;

    const params = {
      KeyConditionExpression: "userName = :userName and orderDate = :orderDate",
      ExpressionAttributeValues: {
        ":userName": { S: userName },
        ":orderDate": { S: orderDate },
      },
      TableName: process.env.DYNAMODB_TABLE_NAME,
    };

    const { Items } = await ddbClient.send(new QueryCommand(params));

    console.log(Items);
    return Items.map((item) => unmarshall(item));
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const getAllOrders = async () => {
  console.log("getAllOrders");

  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
    };

    const { Items } = await ddbClient.send(new ScanCommand(params));

    console.log(Items);
    return Items ? Items.map((item) => unmarshall(item)) : {};
  } catch (error) {
    console.error(error);
  }
};
