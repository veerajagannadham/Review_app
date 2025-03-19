import { APIGatewayProxyHandlerV2 } from "aws-lambda"; // CHANGED
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient({ region: process.env.REGION }); 

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  
  try {
    console.log("[EVENT]", JSON.stringify(event));

    // Extract movieId from path parameters
    const pathParameters = event?.pathParameters;
    const movieId = pathParameters?.movieId
      ? parseInt(pathParameters.movieId)
      : undefined;

    // Validate movieId
    if (!movieId) {
      return {
        statusCode: 400,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Movie ID not present in the table" }),
      };
    }

    // Build the DynamoDB query
    const queryCommandInput: QueryCommandInput = {
      TableName: process.env.TABLE_NAME || "ReviewTable", // Use environment variable or fallback
      KeyConditionExpression: "movieId = :mid",
      ExpressionAttributeValues: {
        ":mid": { N: movieId.toString() }, // Ensure movieId is a string for DynamoDB
      },
    };

    // Query DynamoDB
    const response = await dynamoClient.send(
      new QueryCommand(queryCommandInput)
    );

    // Handle no results
    if (!response.Items || response.Items.length === 0) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "No reviews found for this movie ID" }),
      };
    }

    // Unmarshall DynamoDB items
    const reviews = response.Items.map((item) => unmarshall(item));

    // Return the results
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ reviews }),
    };
  } catch (error: any) {
    console.error("[ERROR]", error);
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
