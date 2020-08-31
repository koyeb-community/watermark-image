/** @format */

"use strict";
const fetch = require("node-fetch");
const S3 = require("aws-sdk/clients/s3");
const Jimp = require("jimp");

const watermarkImageFormats = {
  jpeg: Jimp.MIME_JPEG,
  png: Jimp.MIME_PNG,
  bmp: Jimp.MIME_BMP,
};

const prefix = process.env.WATERMARK_IMAGE_PATH || "watermark-images/";

const watermarkImage = async (s3Instance, bucket, key, watermarkImageUrl) => {
  try {
    let X = null;
    let Y = null;
    const watermarkImageLogoWidth =
      process.env.WATERMARK_IMAGE_LOGO_WIDTH || 10;
    const watermarkImageLogoMargin =
      process.env.WATERMARK_IMAGE_LOGO_MARGIN || 5;
    const watermarkImageLogoPosition =
      process.env.WATERMARK_IMAGE_LOGO_POSITION;

    const watermarkImageFormat = process.env.WATERMARK_IMAGE_FORMAT || "jpeg";

    if (!(watermarkImageFormat in watermarkImageFormats)) {
      throw new Error("Unsupported MIME type.");
    }

    const logo = await Jimp.read(watermarkImageUrl);
    const response = await s3Instance
      .getObject({
        Bucket: bucket,
        Key: key,
      })
      .promise();

    const contentType = response.ContentType;
    const image = await Jimp.read(response.Body);

    logo.resize(image.bitmap.width / watermarkImageLogoWidth, Jimp.AUTO);

    const xMargin = (image.bitmap.width * watermarkImageLogoMargin) / 100;
    const yMargin = (image.bitmap.width * watermarkImageLogoMargin) / 100;

    if (watermarkImageLogoPosition === "bottom-left") {
      X = xMargin;
      Y = image.bitmap.height - logo.bitmap.height - yMargin;
    } else if (watermarkImageLogoPosition === "top-right") {
      X = image.bitmap.width - logo.bitmap.width - xMargin;
      Y = yMargin;
    } else if (watermarkImageLogoPosition === "top-left") {
      X = xMargin;
      Y = yMargin;
    } else {
      X = image.bitmap.width - logo.bitmap.width - xMargin;
      Y = image.bitmap.height - logo.bitmap.height - yMargin;
    }

    image.composite(logo, X, Y, [
      {
        mode: Jimp.BLEND_SCREEN,
        opacitySource: 0.1,
        opacityDest: 1,
      },
    ]);

    const buffer = await image.getBufferAsync(
      watermarkImageFormats[watermarkImageFormat]
    );

    await s3Instance
      .upload({
        Bucket: bucket,
        Key: `${prefix}${key}`,
        Body: buffer,
        ContentType: watermarkImageFormats[watermarkImageFormat],
      })
      .promise();
  } catch (error) {
    throw error;
  }
};

const getS3Configuration = (sourceBucket) => {
  return {
    accessKeyId: process.env[`KOYEB_STORE_${sourceBucket}_ACCESS_KEY`],
    secretAccessKey: process.env[`KOYEB_STORE_${sourceBucket}_SECRET_KEY`],
    region: process.env[`KOYEB_STORE_${sourceBucket}_REGION`],
    endpoint: process.env[`KOYEB_STORE_${sourceBucket}_ENDPOINT`],
  };
};

const validateEnvironment = (sourceBucket) => {
  if (!sourceBucket) {
    throw new Error("Bucket name not present in event payload.");
  }

  if (
    !process.env?.[`KOYEB_STORE_${sourceBucket}_ACCESS_KEY`] ||
    !process.env?.[`KOYEB_STORE_${sourceBucket}_SECRET_KEY`] ||
    !process.env[`KOYEB_STORE_${sourceBucket}_REGION`] ||
    !process.env[`KOYEB_STORE_${sourceBucket}_ENDPOINT`]
  ) {
    throw new Error(
      `One of the following environment variables are missing: KOYEB_STORE_${sourceBucket}_ACCESS_KEY, KOYEB_STORE_${sourceBucket}_SECRET_KEY, KOYEB_STORE_${sourceBucket}_ENDPOINT, KOYEB_STORE_${sourceBucket}_REGION.`
    );
  }

  if (!process.env.WATERMARK_IMAGE_URL) {
    throw Error("Environment variable WATERMARK_IMAGE_URL must be set.");
  }

  try {
    new URL(process.env.WATERMARK_IMAGE_URL);
  } catch {
    throw Error("Not a valid url provided.");
  }
};

const handler = async (event) => {
  const bucket = event?.bucket?.name;
  const key = event?.object?.key;

  if (key.startsWith(prefix)) {
    return;
  }

  validateEnvironment(bucket);

  const s3Instance = new S3(getS3Configuration(bucket));

  await watermarkImage(
    s3Instance,
    bucket,
    key,
    process.env.WATERMARK_IMAGE_URL
  );
};

module.exports.handler = handler;
