const BRIGHT_DATA_TRIGGER = "https://api.brightdata.com/datasets/v3/trigger";
const DATASET_ID = "gd_lk56epmy2i5g7lzu0k";
const CUSTOM_OUTPUT_FIELDS =
  "transcript,url,title,video_id,youtuber_id,transcript_language,description,is_age_restricted";

export const triggerYoutube = async (videoUrl, options = {}) => {
  const {
    notifyUrl,
    includeErrors = true,
    datasetId = DATASET_ID,
    token = process.env.BRIGHTDATA_API_TOKEN,
  } = options;

  if (!notifyUrl) {
    throw new Error("notifyUrl is required to trigger Bright Data dataset");
  }

  const params = new URLSearchParams({
    dataset_id: datasetId,
    custom_output_fields: CUSTOM_OUTPUT_FIELDS,
    notify: notifyUrl,
    include_errors: String(includeErrors),
  });

  const payload = {
    input: [
      {
        url: videoUrl,
        country: "",
        transcription_language: "",
      },
    ],
  };

  const response = await fetch(`${BRIGHT_DATA_TRIGGER}?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(responseData));
  }

  return responseData;
};
