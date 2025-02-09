import { sparqlEscapeUri, sparqlEscapeString } from "mu";
import { querySudo as query, updateSudo as update } from "@lblod/mu-auth-sudo";
import {
  ORG_GRAPH_BASE,
  ORG_GRAPH_SUFFIX,
  SYSTEM_EMAIL_GRAPH,
  OUTBOX_FOLDER_URI,
} from "../config";
import { parseResult } from "./utils";
import { PREFIXES } from "./constants";

/**
 * Fetching all relevant information about the submission so it can be extracted for later use.
 * Note : Submissions can be linked to multiple email through the dct:relation
 */
export async function getSubmissionInfo() {
  try {
    const queryInfo = `
    ${PREFIXES}
    SELECT DISTINCT
      ?targetEenheid
      ?targetEenheidUuid
      ?targetEenheidLabel
      ?creatorEenheidLabel
      ?decisionTypeLabel
      ?sentDate
      ?emailAddress
      ?submissionUri
    WHERE {
        ?targetEenheid a besluit:Bestuurseenheid ;
          mu:uuid ?targetEenheidUuid ;
          ext:wilMailOntvangen "true"^^<http://mu.semte.ch/vocabularies/typed-literals/boolean> ;
          ext:mailAdresVoorNotificaties ?emailAddress ;
          skos:prefLabel ?targetEenheidLabel .
      BIND(IRI(CONCAT(${sparqlEscapeString(
        ORG_GRAPH_BASE
      )}, ?targetEenheidUuid, ${sparqlEscapeString(
      ORG_GRAPH_SUFFIX
    )})) as ?graph)
      GRAPH ?graph {
        ?submissionUri a meb:Submission ;
          pav:createdBy ?creatorEenheid ;
          nmo:sentDate ?sentDate ;
          prov:generated ?formData .
      }
      FILTER (?targetEenheid != ?creatorEenheid)
      FILTER NOT EXISTS {
        GRAPH ${sparqlEscapeUri(SYSTEM_EMAIL_GRAPH)} {
          ?email dct:relation ?submissionUri ;
            dct:relation ?targetEenheid ;
            a nmo:Email .
        }
      }
      ?creatorEenheid a besluit:Bestuurseenheid ;
        skos:prefLabel ?creatorEenheidLabel .
      ?formData dct:type ?decisionType .
      ?decisionType skos:prefLabel ?decisionTypeLabel .
    }
  `;
    return parseResult(await query(queryInfo));
  } catch (err) {
    console.log(err);
    throw new Error(err);
  }
}

/**
 * Puts email in the right mail folder graph for sending
 * @param {Array} submissions
 * @param {Object} email
 * @param {String} targetEenheid
 */
export async function insertEmail(submissions, email, targetEenheid) {
  try {
    const submissionRelations = `dct:relation ${submissions
      .map(({submissionUri}) => sparqlEscapeUri(submissionUri))
      .join(", ")}`;

    const emailQuery = `
  ${PREFIXES}
  INSERT DATA {
    GRAPH ${sparqlEscapeUri(SYSTEM_EMAIL_GRAPH)} {
  
  ${sparqlEscapeUri(email.uri)}
      rdf:type nmo:Email ;
      mu:uuid ${sparqlEscapeString(email.uri.split("/").pop())} ;
      nmo:isPartOf ${sparqlEscapeUri(OUTBOX_FOLDER_URI)} ;
      nmo:htmlMessageContent ${sparqlEscapeString(email.htmlContent)} ;
      nmo:plainTextMessageContent ${sparqlEscapeString(email.plainTextMessageContent)} ;
      nmo:messageSubject ${sparqlEscapeString(email.subject)} ;
      nmo:emailTo ${sparqlEscapeString(email.to)} ;
      nmo:messageFrom ${sparqlEscapeString(process.env.FROM_EMAIL_ADDRESS)} ;
      ${email.bcc ? `nmo:bcc ${sparqlEscapeString(email.bcc)} ;` : ""}
      dct:relation ${sparqlEscapeUri(targetEenheid)} ;
      ${submissionRelations} .
    }
  }`;
    await update(emailQuery);
  } catch (err) {
    console.log("error", err);
    throw new Error(err);
  }
}
