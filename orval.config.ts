export default {
  flathub: {
    input: {
      target: "https://flathub.org/api/v2/openapi.json",
    },
    output: {
      mode: "single",
      target: "src/generated/flathub-api.ts",
      client: "fetch",
      clean: true,
      baseUrl: "https://flathub.org/api/v2",
    },
  },
};
