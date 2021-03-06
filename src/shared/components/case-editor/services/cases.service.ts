import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { AbstractAppConfig } from '../../../../app.config';
import { plainToClass } from 'class-transformer';
import { Headers } from '@angular/http';
import { HttpErrorService, HttpService, OrderService } from '../../../services';
import { ShowCondition } from '../../../directives/conditional-show/domain/conditional-show.model';
import { catchError, map, tap } from 'rxjs/operators';
import { CaseEventData, CaseEventTrigger, CasePrintDocument, CaseView, Draft } from '../../../domain';
import { WizardPage } from '../domain';
import { WizardPageFieldToCaseFieldMapper } from './wizard-page-field-to-case-field.mapper';

@Injectable()
export class CasesService {
  // Internal (UI) API
  public static readonly V2_MEDIATYPE_CASE_VIEW = 'application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-case-view.v2+json';
  public static readonly V2_MEDIATYPE_START_CASE_TRIGGER =
    'application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-start-case-trigger.v2+json;charset=UTF-8';
  public static readonly V2_MEDIATYPE_START_EVENT_TRIGGER =
    'application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-start-event-trigger.v2+json;charset=UTF-8';
  public static readonly V2_MEDIATYPE_START_DRAFT_TRIGGER =
    'application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-start-draft-trigger.v2+json;charset=UTF-8';

  // External (Data Store) API

  public static readonly V2_MEDIATYPE_CASE_DOCUMENTS =
    'application/vnd.uk.gov.hmcts.ccd-data-store-api.case-documents.v2+json;charset=UTF-8';

  public static readonly V2_MEDIATYPE_CASE_DATA_VALIDATE =
    'application/vnd.uk.gov.hmcts.ccd-data-store-api.case-data-validate.v2+json;charset=UTF-8';
  public static readonly V2_MEDIATYPE_CREATE_EVENT =
    'application/vnd.uk.gov.hmcts.ccd-data-store-api.create-event.v2+json;charset=UTF-8';
  public static readonly V2_MEDIATYPE_CREATE_CASE =
    'application/vnd.uk.gov.hmcts.ccd-data-store-api.create-case.v2+json;charset=UTF-8';

  /**
   *
   * @type {(caseId:string)=>"../../Observable".Observable<Case>}
   * @deprecated Use `CasesService::getCaseView` instead
   */
  get = this.getCaseView;

  constructor(
    private http: HttpService,
    private appConfig: AbstractAppConfig,
    private orderService: OrderService,
    private errorService: HttpErrorService,
    private wizardPageFieldToCaseFieldMapper: WizardPageFieldToCaseFieldMapper
  ) {
  }

  getCaseView(jurisdictionId: string,
              caseTypeId: string,
              caseId: string): Observable<CaseView> {
    const url = this.appConfig.getApiUrl()
      + `/caseworkers/:uid`
      + `/jurisdictions/${jurisdictionId}`
      + `/case-types/${caseTypeId}`
      + `/cases/${caseId}`;

    return this.http
      .get(url)
      .pipe(
        map(response => response.json()),
        catchError(error => {
          this.errorService.setError(error);
          return throwError(error);
        })
      );
  }

  getCaseViewV2(caseId: string): Observable<CaseView> {
    const url = `${this.appConfig.getCaseDataUrl()}/internal/cases/${caseId}`;
    const headers = new Headers({
      'Accept': CasesService.V2_MEDIATYPE_CASE_VIEW,
      'experimental': 'true',
    });

    return this.http
      .get(url, {headers})
      .pipe(
        map(response => response.json()),
        catchError(error => {
          this.errorService.setError(error);
          return throwError(error);
        })
      );
  }

  getEventTrigger(caseTypeId: string,
                  eventTriggerId: string,
                  caseId?: string,
                  ignoreWarning?: string): Observable<CaseEventTrigger> {
    ignoreWarning = undefined !== ignoreWarning ? ignoreWarning : 'false';

    let url = this.buildEventTriggerUrl(caseTypeId, eventTriggerId, caseId, ignoreWarning);

    let headers = new Headers({
      'experimental': 'true'
    });
    if (Draft.isDraft(caseId)) {
      headers.set('Accept', CasesService.V2_MEDIATYPE_START_DRAFT_TRIGGER);
    } else if (caseId !== undefined && caseId !== null) {
      headers.set('Accept', CasesService.V2_MEDIATYPE_START_EVENT_TRIGGER);
    } else {
      headers.set('Accept', CasesService.V2_MEDIATYPE_START_CASE_TRIGGER);
    }

    return this.http
      .get(url, {headers})
      .pipe(
        map(response => response.json()),
        catchError(error => {
          this.errorService.setError(error);
          return throwError(error);
        }),
        map((p: Object) => plainToClass(CaseEventTrigger, p)),
        tap(eventTrigger => this.initialiseEventTrigger(eventTrigger))
      );
  }

  createEvent(caseDetails: CaseView, eventData: CaseEventData): Observable<object> {
    const caseId = caseDetails.case_id;
    const url = this.appConfig.getCaseDataUrl() + `/cases/${caseId}/events`;

    let headers = new Headers({
      'experimental': 'true',
      'Accept': CasesService.V2_MEDIATYPE_CREATE_EVENT
    });

    return this.http
      .post(url, eventData, {headers})
      .pipe(
        map(response => this.processResponse(response)),
        catchError(error => {
          this.errorService.setError(error);
          return throwError(error);
        })
      );
  }

  validateCase(ctid: string, eventData: CaseEventData, pageId: string): Observable<object> {
    const pageIdString = pageId ? '?pageId=' + pageId : '';
    const url = this.appConfig.getCaseDataUrl()
      + `/case-types/${ctid}/validate${pageIdString}`;

    let headers = new Headers({
      'experimental': 'true',
      'Accept': CasesService.V2_MEDIATYPE_CASE_DATA_VALIDATE
    });

    return this.http
      .post(url, eventData, {headers})
      .pipe(
        map(response => response.json()),
        catchError(error => {
          this.errorService.setError(error);
          return throwError(error);
        })
      );
  }

  createCase(ctid: string, eventData: CaseEventData): Observable<object> {
    let ignoreWarning = 'false';

    if (eventData.ignore_warning) {
      ignoreWarning = 'true';
    }
    const url = this.appConfig.getCaseDataUrl()
      + `/case-types/${ctid}/cases?ignore-warning=${ignoreWarning}`;

    let headers = new Headers({
      'experimental': 'true',
      'Accept': CasesService.V2_MEDIATYPE_CREATE_CASE
    });

    return this.http
      .post(url, eventData, {headers})
      .pipe(
        map(response => this.processResponse(response)),
        catchError(error => {
          this.errorService.setError(error);
          return throwError(error);
        })
      );
  }

  getPrintDocuments(caseId: string): Observable<CasePrintDocument[]> {
    const url = this.appConfig.getCaseDataUrl()
      + `/cases/${caseId}`
      + `/documents`;

    let headers = new Headers({
      'experimental': 'true',
      'Accept': CasesService.V2_MEDIATYPE_CASE_DOCUMENTS
    });

    return this.http
      .get(url, {headers})
      .pipe(
        map(response => response.json().documentResources),
        catchError(error => {
          this.errorService.setError(error);
          return throwError(error);
        })
      );
  }

  private buildEventTriggerUrl(caseTypeId: string,
                               eventTriggerId: string,
                               caseId?: string,
                               ignoreWarning?: string): string {
    let url = this.appConfig.getCaseDataUrl() + `/internal`;

    if (Draft.isDraft(caseId)) {
      url += `/drafts/${caseId}`
        + `/event-trigger`
        + `?ignore-warning=${ignoreWarning}`;
    } else if (caseTypeId === undefined || caseTypeId === null) {
      url += `/cases/${caseId}`
        + `/event-triggers/${eventTriggerId}`
        + `?ignore-warning=${ignoreWarning}`;
    } else {
      url += `/case-types/${caseTypeId}`
        + `/event-triggers/${eventTriggerId}`
        + `?ignore-warning=${ignoreWarning}`;
    }

    return url;
  }

  private processResponse(response) {
    if (response.headers && response.headers.get('content-type').match(/application\/.*json/)) {
      return response.json();
    }
    return {'id': ''};
  }

  private initialiseEventTrigger(eventTrigger: CaseEventTrigger) {
    if (!eventTrigger.wizard_pages) {
      eventTrigger.wizard_pages = [];
    }

    eventTrigger.wizard_pages.forEach((wizardPage: WizardPage) => {
      wizardPage.parsedShowCondition = new ShowCondition(wizardPage.show_condition);
      wizardPage.case_fields = this.orderService.sort(
        this.wizardPageFieldToCaseFieldMapper.mapAll(wizardPage.wizard_page_fields, eventTrigger.case_fields));
    });
  }

}
