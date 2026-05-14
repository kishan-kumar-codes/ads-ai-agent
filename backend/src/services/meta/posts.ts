import { metaRequest } from "./client.js";

export interface FacebookPage {
  id: string;
  name: string;
  access_token?: string;
  tasks?: string[];
}

export interface PublishFacebookPhotoInput {
  userAccessToken: string;
  pageId?: string;
  caption: string;
  imageBase64: string;
  imageMimeType?: string;
}

export interface PublishFacebookVideoInput {
  userAccessToken: string;
  pageId?: string;
  caption: string;
  videoBytes: Buffer;
  videoMimeType?: string;
}

export class FacebookPagePublishError extends Error {
  constructor(
    message: "facebook_page_missing" | "facebook_page_permission_missing" | "facebook_image_missing" | "facebook_video_missing",
  ) {
    super(message);
    this.name = "FacebookPagePublishError";
  }
}

export async function listFacebookPages(accessToken: string) {
  const result = await metaRequest<{ data: FacebookPage[] }>({
    accessToken,
    path: "/me/accounts",
    query: {
      fields: "id,name,access_token,tasks",
      limit: 50,
    },
  });
  return result.data;
}

export async function resolvePublishablePage(accessToken: string, preferredPageId?: string) {
  const pages = await listFacebookPages(accessToken);
  const page = preferredPageId
    ? pages.find((item) => item.id === preferredPageId)
    : pages.find((item) => canPublishToPage(item)) ?? pages[0];

  if (!page?.access_token) {
    throw new FacebookPagePublishError("facebook_page_missing");
  }
  if (!canPublishToPage(page)) {
    throw new FacebookPagePublishError("facebook_page_permission_missing");
  }
  return { ...page, access_token: page.access_token };
}

export async function publishFacebookPhotoPost(input: PublishFacebookPhotoInput) {
  if (!input.imageBase64.trim()) {
    throw new FacebookPagePublishError("facebook_image_missing");
  }

  const page = await resolvePublishablePage(input.userAccessToken, input.pageId);
  const bytes = Buffer.from(input.imageBase64, "base64");
  const form = new FormData();
  form.set("message", input.caption);
  form.set("published", "true");
  form.set(
    "source",
    new Blob([bytes], { type: input.imageMimeType ?? "image/png" }),
    "facebook-post.png",
  );

  const result = await metaRequest<{ id: string; post_id?: string }>({
    accessToken: page.access_token,
    path: `/${page.id}/photos`,
    method: "POST",
    body: form,
  });

  return {
    page,
    photoId: result.id,
    postId: result.post_id,
  };
}

export async function publishFacebookVideoPost(input: PublishFacebookVideoInput) {
  if (input.videoBytes.byteLength === 0) {
    throw new FacebookPagePublishError("facebook_video_missing");
  }

  const page = await resolvePublishablePage(input.userAccessToken, input.pageId);
  const form = new FormData();
  form.set("description", input.caption);
  form.set("published", "true");
  form.set(
    "source",
    new Blob([input.videoBytes], { type: input.videoMimeType ?? "video/mp4" }),
    "facebook-post.mp4",
  );

  const result = await metaRequest<{ id: string; post_id?: string }>({
    accessToken: page.access_token,
    path: `/${page.id}/videos`,
    method: "POST",
    body: form,
  });

  return {
    page,
    videoId: result.id,
    postId: result.post_id,
  };
}

function canPublishToPage(page: FacebookPage) {
  if (!page.tasks?.length) return true;
  return page.tasks.includes("CREATE_CONTENT") || page.tasks.includes("MANAGE");
}
