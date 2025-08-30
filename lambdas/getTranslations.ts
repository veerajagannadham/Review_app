import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  TranslateClient,
  TranslateTextCommand,
} from "@aws-sdk/client-translate";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { Reviews } from "../shared/types";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = createDDbDocClient();
const translateClient = new TranslateClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  // Validate path parameters
  if (!event.pathParameters?.movieId || !event.pathParameters?.reviewId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request: movieId and reviewId are required",
      }),
    };
  }

  // Validate query parameters
  if (!event.queryStringParameters?.language) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request: language is required",
      }),
    };
  }

  const movieId = parseInt(event.pathParameters.movieId, 10);
  const reviewId = parseInt(event.pathParameters.reviewId, 10);
  const targetLanguage = event.queryStringParameters.language;

  if (isNaN(movieId) || isNaN(reviewId)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request: movieId and reviewId must be numbers",
      }),
    };
  }

  console.log("movieId:", movieId);
  console.log("reviewId:", reviewId);
  console.log("targetLanguage:", targetLanguage);

  try {
    // Fetch the review from DynamoDB
    const getResponse = await dynamoClient.send(
      new GetItemCommand({
        TableName: process.env.TABLE_NAME,
        Key: {
          movieId: { N: movieId.toString() },
          reviewId: { N: reviewId.toString() }, 
        },
      })
    );

    console.log(
      "DynamoDB GetItem Response:",
      JSON.stringify(getResponse, null, 2)
    );

    // Check if the review exists
    if (!getResponse.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Review not found" }),
      };
    }

    // Unmarshall the DynamoDB item into a MovieReview object
    const review = unmarshall(getResponse.Item) as Reviews;
    console.log("Unmarshalled Review:", JSON.stringify(review, null, 2));

    const translations = review.reviewTranslation || {}; 
    // Check if the translation already exists
    if (translations[targetLanguage]) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          originalReview: review.content,
          translatedReview: `${translations[targetLanguage]} [from DB]`,
          language: targetLanguage,
        }),
      };
    }

    // Translate the review content
    const translatedResp = await translateClient.send(
      new TranslateTextCommand({
        SourceLanguageCode: "en", 
        TargetLanguageCode: targetLanguage,
        Text: review.content,
      })
    );
    const translatedText = translatedResp.TranslatedText;

    // Update DynamoDB to store the new translation
    await dynamoClient.send(
        new UpdateCommand({
          TableName: process.env.TABLE_NAME,
          Key: { movieId: movieId, reviewId: reviewId }, 
          UpdateExpression: "SET reviewTranslation.#lang = :translation",
          ExpressionAttributeNames: {
            "#lang": targetLanguage, 
          },
          ExpressionAttributeValues: {
            ":translation": translatedText,
          },
        })
      );
      
    console.log(
      "TranslateText Response:",
      JSON.stringify(translatedResp, null, 2)
    );

    // Return the translated review
    return {
      statusCode: 200,
      body: JSON.stringify({
        originalReview: review.content,
        translatedReview: translatedText,
        language: targetLanguage,
      }),
    };
  } catch (error) {
    console.error("Error Details:", JSON.stringify(error, null, 2));
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error",
        error: error.message,
      }),
    };
  }
};

function createDDbDocClient() {
    const ddbClient = new DynamoDBClient({ region: process.env.REGION });
    const marshallOptions = {
      convertEmptyValues: true,
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    };
    const unmarshallOptions = {
      wrapNumbers: false,
    };
    const translateConfig = { marshallOptions, unmarshallOptions };
    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
  }
