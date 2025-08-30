import {
    DynamoDBClient,
    GetItemCommand,
    UpdateItemCommand,
  } from "@aws-sdk/client-dynamodb";
  import { unmarshall } from "@aws-sdk/util-dynamodb";
  import { APIGatewayProxyHandlerV2 } from "aws-lambda";
  import { Reviews } from "../shared/types";
  import { getFormattedDate, JWTVerifier } from "../shared/util"; // Ensure JWTVerifier is imported
  
  const dynamoClient = new DynamoDBClient();
  
  export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    // Validate path parameters
    if (!event.pathParameters?.movieId || !event.pathParameters?.reviewId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Invalid request: movieId and reviewId are required",
        }),
      };
    }
  
    // Extract JWT token from the Cookie header and then split and trim it
    const getTokenFromCookie = (
      cookieHeader: string | undefined
    ): string | null => {
      if (!cookieHeader) return null;
      const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
      const tokenCookie = cookies.find((cookie) => cookie.startsWith("token="));
      return tokenCookie ? tokenCookie.split("=")[1] : null;
    };
  
    const token = getTokenFromCookie(event.headers?.Cookie);
    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Authorization token is required" }),
      };
    }
  
    const { movieId, reviewId } = event.pathParameters;
  
    // Verify JWT token
    let tokenPayload;
    try {
      tokenPayload = await JWTVerifier.verify(token);
      if (!tokenPayload.sub) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: "Invalid token: missing sub claim" }),
        };
      }
    } catch (error) {
      console.error("Token verification error:", error);
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Invalid token" }),
      };
    }
  
    // Extract reviewerId from the token
    const reviewerId = tokenPayload["cognito:username"];
  
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
  
      // Verify if the reviewer is authorized to update the review
      if (unmarshalled.reviewerId !== reviewerId) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            message: "You are not authorized to update this review",
          }),
        };
      }
  
      // Update the review
      const reviewDate = getFormattedDate();
      await dynamoClient.send(
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
        body: JSON.stringify({ message: "Internal server error" }),
      };
    }
  };