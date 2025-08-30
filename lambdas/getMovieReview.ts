import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import Ajv from "ajv";
import schema from "../shared/types.schema.json";
import { ExtendedReviewQueryParams } from "../shared/types";

const ajv = new Ajv();
const isValidQueryParams = ajv.compile(
  schema.definitions["ExtendedReviewQueryParams"] || {}
);

const dynamoClient = new DynamoDBClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    console.log("[EVENT]", JSON.stringify(event));

    // Extract movieId from path parameters
    const pathParams = event.pathParameters;
    if (!pathParams || !pathParams.movieId) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "movieId is required in the path" }),
      };
    }

    // Validate movieId
    const movieId = parseInt(pathParams.movieId, 10);
    if (isNaN(movieId)) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "movieId must be a valid number" }),
      };
    }

    // Extract reviewId from query parameters 
    const queryParams = event.queryStringParameters || {};
    let reviewId: number | undefined;
    if (queryParams.reviewId !== undefined) {
      const parsedReviewId = parseInt(queryParams.reviewId, 10);
      if (!isNaN(parsedReviewId)) {
        reviewId = parsedReviewId;
      } else {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "reviewId must be a valid number" }),
        };
      }
    }

    /// Build the query for DynamoDB
    let queryCommandInput: QueryCommandInput = {
      TableName: process.env.TABLE_NAME || "ReviewsTable",
      KeyConditionExpression: "movieId = :mid",
      ExpressionAttributeValues: {
        ":mid": { N: movieId.toString() },
      },
    };

    // If reviewId is provided, include it in KeyConditionExpression
    if (reviewId !== undefined) {
      queryCommandInput.KeyConditionExpression += " AND reviewId = :rid";
      queryCommandInput.ExpressionAttributeValues![":rid"] = { N: reviewId.toString(),
      };
    }

    // Query DynamoDB
    const response = await dynamoClient.send(
      new QueryCommand(queryCommandInput)
    );

    if (!response.Items || response.Items.length === 0) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "No matching reviews found" }),
      };
    }

    // Unmarshall DynamoDB items
    const reviews = response.Items.map((item) => unmarshall(item));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviews }),
    };
  } catch (error: any) {
    console.error("[ERROR]", error);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
