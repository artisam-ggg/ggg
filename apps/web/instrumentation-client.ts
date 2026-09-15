import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (projectToken) {
  posthog.init(projectToken, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    defaults: "2026-05-30",
    opt_out_capturing_by_default: true,
    disable_session_recording: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
  });
}
