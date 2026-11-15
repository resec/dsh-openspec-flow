# Spec Delta: review-documentation

## MODIFIED Requirements

### Requirement: The document states the reviewer boundary and validation owner

`docs/review.md` SHALL state that the independent reviewer's model-facing catalog contains `read`, `grep`, `glob`, `read_image`, `web_search`, `web_fetch` and `openspec_reviewer`, with `read_image` conditional on the Host `attachments` service; that inherited Host tools are masked; and that apply review start and resume run strict validation, with the result carried in the brief. It SHALL NOT claim that the reviewer validates the change itself.

#### Scenario: Document names the reviewer catalog

- **WHEN** `docs/review.md` is read
- **THEN** it lists only the seven reviewer tools, conditions `read_image` on the `attachments` service, and says inherited Host tools are masked

#### Scenario: Document names the image-read prerequisites

- **WHEN** `docs/review.md` describes `read_image`
- **THEN** it states the Host `attachments` service and an image-capable route are required

#### Scenario: Document names the validation owner

- **WHEN** the review document describes apply review
- **THEN** it says the plugin runs strict validation at start or resume and the brief carries the result
