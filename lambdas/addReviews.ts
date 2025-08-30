import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { AddReviewType, Reviews } from "../shared/types";
import { getFormattedDate, JWTVerifier } from "../shared/util"; 
import Ajv from "ajv";
import schema from "../shared/types.schema.json";

const ajv = new Ajv();
const isValidBodyParams = ajv.compile(schema.definitions["Reviews"] || {});

const dynamoClient = new DynamoDBClient();
let reviewId = 1000;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // Extract JWT token from the Cookie header
  const getTokenFromCookie = (cookieHeader: string | undefined): string | null => {
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

  // Extract reviewerId (email) from the token
  const reviewerId = tokenPayload["cognito:username"];

  // Validate request body
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid request: body is required" }),
    };
  }

  let requestBody: AddReviewType;
  try {
    requestBody = JSON.parse(event.body) as AddReviewType;
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request: body must be valid JSON",
      }),
    };
  }

  // Validate required fields
  if (!requestBody.movieId || !requestBody.content) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request: movieId and content are required",
      }),
    };
  }

  try {
    // Create the review object
    const bodyToAdd: Reviews = {
      movieId: requestBody.movieId,
      reviewId: reviewId,
      reviewerId: reviewerId, // Use the email from the token as reviewerId
      reviewDate: getFormattedDate(),
      content: requestBody.content,
    };

    // Add the review to DynamoDB
    const response = await dynamoClient.send(
      new PutItemCommand({
        TableName: "ReviewsTable",
        Item: marshall(bodyToAdd, { removeUndefinedValues: true }),
      })
    );

    // Increment reviewId for the next review
    reviewId++;

    // Return success response
    return {
      statusCode: 201,
      body: JSON.stringify({ message: "Review added successfully" }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};