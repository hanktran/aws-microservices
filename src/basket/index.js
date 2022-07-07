import {
  GetItemCommand,
  ScanCommand,
  PutItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { ddbClient } from "./ddbClient";
import { ebClient } from "./eventBridgeClient";

exports.handler = async function (event) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  let body;
  try {
    switch (event.httpMethod) {
      case "GET":
        if (event.pathParameters !== null) {
          body = await getBasket(event.pathParameters.userName);
        } else {
          body = await getAllBaskets();
        }
        break;
      case "POST":
        if (event.path === "/basket/checkout") {
          body = await checkoutBasket(event);
        } else {
          body = await createBasket(event);
        }
        break;
      case "DELETE":
        body = await deleteBasket(event.pathParameters.userName);
        break;
      default:
        throw new Error(`Unsupported route: "${event.httpMethod}"`);
    }

    console.log(body);
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        message: `'Successfully finished operation: "${event.httpMethod}"`,
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

const getBasket = async (userName) => {
  console.log("getBasket");

  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: marshall({ userName: userName }),
    };

    const { Item } = await ddbClient.send(new GetItemCommand(params));

    console.log(Item);
    return Item ? unmarshall(Item) : {};
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const getAllBaskets = async () => {
  console.log("getAllBaskets");

  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
    };

    const { Items } = await ddbClient.send(new ScanCommand(params));

    console.log(Items);
    return Items ? Items.map((item) => unmarshall(item)) : {};
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const createBasket = async (event) => {
  console.log(`createBasket function. event: "${event}"`);

  try {
    const requestBody = JSON.parse(event.body);
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: marshall(requestBody || {}),
    };

    const createResult = await ddbClient.send(new PutItemCommand(params));

    console.log(createResult);
    return createResult;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const deleteBasket = async (userName) => {
  console.log(`deleteBasket function. userName: "${userName}"`);

  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: marshall({ userName: userName }),
    };

    const deleteResult = await ddbClient.send(new DeleteItemCommand(params));

    console.log(deleteResult);
    return deleteResult;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const checkoutBasket = async (event) => {
  console.log("checkoutBasket");

  const checkoutRequest = JSON.parse(event.body);
  if (checkoutBasket === null || checkoutRequest.userName === null) {
    throw new Error(
      `userName should exist in checkoutRequest: "${checkoutRequest}"`
    );
  }

  // Get existing basket with items
  const basket = await getBasket(checkoutRequest.userName);

  //  Create an event json object with basket items, calculate totalprice, prepare oder create json data to send odering ms
  const checkoutPayload = prepareOderPayload(checkoutRequest, basket);

  // Publish an event to eventbridge
  const publishedEvent = await publishCheckoutBasketEvent(checkoutPayload);

  // Remove existing basket
  await deleteBasket(checkoutRequest.userName);
};

const prepareOderPayload = (checkoutRequest, basket) => {
  console.log("prepareOrderPayload");

  try {
    if (basket === null || basket.items === null) {
      throw new Error(`basket should exist in items: "${basket}"`);
    }

    const totalPrice = basket.items.reduce((acc, item) => acc + item.price, 0);
    checkoutRequest.totalPrice = totalPrice;
    console.log(checkoutRequest);

    Object.assign(checkoutRequest, basket);
    console.log("Success prepareOrderPayload, orderPayload:", checkoutRequest);

    return checkoutRequest;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const publishCheckoutBasketEvent = async (checkoutPayload) => {
  console.log("publishCheckoutBasketEvent with payload:", checkoutPayload);

  try {
    const params = {
      Entries: [
        {
          Source: process.env.EVENT_SOURCE,
          Detail: JSON.stringify(checkoutPayload),
          DetailType: process.env.EVENT_DETAILTYPE,
          Resources: [],
          EventBusName: process.env.EVENT_BUSNAME,
        },
      ],
    };

    const data = await ebClient.send(new PutEventsCommand(params));

    console.log("Success, event sent; requestId:", data);
    return data;
  } catch (error) {
    console.log(error);
    throw error;
  }
};
