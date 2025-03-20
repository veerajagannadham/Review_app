import {
    DynamoDBClient,
    GetItemCommand,
    UpdateItemCommand,
  } from "@aws-sdk/client-dynamodb";
  import { unmarshall } from "@aws-sdk/util-dynamodb";
  import { APIGatewayProxyHandlerV2 } from "aws-lambda";
  import { Reviews } from "../shared/types";
  import { getFormattedDate } from "../shared/util";
  
  const dynamoClient = new DynamoDBClient();
  
  export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    // Validate path parameters
    if (!event.pathParameters?.movieId || !event.pathParameters?.reviewId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid request: movieId and reviewId are required" }),
      };
    }
  
    const { movieId, reviewId } = event.pathParameters;
  
    // Validate request body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid request: body is required" }),
      };
    }
  
    const body = JSON.parse(event.body);
    const content = body.content;
  
    if (!content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid request: content is required" }),
      };
    }
  
    try {
      // Fetch the review from DynamoDB
      const reviewItems = await dynamoClient.send(
        new GetItemCommand({
          TableName: "ReviewsTable",
          Key: {
            movieId: { N: movieId },
            reviewId: { N: reviewId },
          },
        })
      );
  
      // Check if the review exists
      if (!reviewItems.Item) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "Review not found" }),
        };
      }
  
      // Unmarshall the DynamoDB item into a MovieReview object
      const unmarshalled: Reviews = unmarshall(reviewItems.Item) as Reviews;
  
      // Update the review
      const reviewDate = getFormattedDate();
      const updateResp = await dynamoClient.send(
        new UpdateItemCommand({
          TableName: "ReviewsTable",
          Key: {
            movieId: { N: movieId },
            reviewId: { N: reviewId },
          },
          UpdateExpression: "SET reviewDate = :rd, content = :ct",
          ExpressionAttributeValues: {
            ":rd": { S: reviewDate },
            ":ct": { S: content },
          },
        })
      );
  
      // Return success response
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Review updated successfully" }),
      };
    } catch (error) {
      console.error("Error:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Internal server error"}),
      };
    }
  };