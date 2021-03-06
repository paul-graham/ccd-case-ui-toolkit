import { Component } from '@angular/core';
import { AbstractFieldReadComponent } from '../base-field/abstract-field-read.component';

@Component({
  selector: 'ccd-read-case-link-field',
  templateUrl: 'read-case-link-field.html'
})
export class ReadCaseLinkFieldComponent extends AbstractFieldReadComponent {

  public hasReference(): boolean {
    return this.caseField.value && this.caseField.value.CaseReference;
  }
}
