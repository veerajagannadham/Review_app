import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { Reviews } from "../shared/types";

const dynamoClient = new DynamoDBClient({ region: process.env.REGION });
const translateClient = new TranslateClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    console.log("Event:", JSON.stringify(event, null, 2));

    // Validate path parameters
    if (!event.pathParameters?.movieId || !event.pathParameters?.reviewId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Invalid request: movieId and reviewId are required" }),
        };
    }

    // Validate query parameters
    if (!event.queryStringParameters?.language) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Invalid request: language is required" }),
        };
    }

    const { movieId, reviewId } = event.pathParameters;
    const targetLanguage = event.queryStringParameters.language;

    console.log("movieId:", movieId);
    console.log("reviewId:", reviewId);
    console.log("targetLanguage:", targetLanguage);

    try {
        // Fetch the review from DynamoDB
        const getResponse = await dynamoClient.send(
            new GetItemCommand({
                TableName: process.env.TABLE_NAME, // Use environment variable for table name
                Key: {
                    movieId: { N: movieId }, // Ensure this matches the data type in DynamoDB
                    reviewId: { N: reviewId }, // Ensure this matches the data type in DynamoDB
                },
            })
        );

        console.log("DynamoDB GetItem Response:", JSON.stringify(getResponse, null, 2));

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

        // Translate the review content
        const translatedResp = await translateClient.send(
            new TranslateTextCommand({
                SourceLanguageCode: "en", // Assuming the source language is English
                TargetLanguageCode: targetLanguage,
                Text: review.content,
            })
        );

        console.log("TranslateText Response:", JSON.stringify(translatedResp, null, 2));

        // Return the translated review
        return {
            statusCode: 200,
            body: JSON.stringify({ translated_review: translatedResp.TranslatedText }),
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal server error" }),
        };
    }
};