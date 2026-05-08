import { Component, OnInit } from '@angular/core';
import { AuthService, LocalUser } from 'src/app/_services/auth.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {

  loginDisplay = false;
  displayedColumns: string[] = ['claim', 'value'];
  dataSource: any = [];

  constructor(private authService: AuthService) { }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.loginDisplay = Boolean(user);

    if (user) {
      this.getClaims(user);
    }
  }

  getClaims(user: LocalUser): void {
    this.dataSource = [
      { id: 1, claim: 'Display Name', value: user.name },
      { id: 2, claim: 'Email', value: user.email },
      { id: 3, claim: 'Local User ID', value: user.id },
      { id: 4, claim: 'Role', value: user.roleLabel }
    ];
  }
}
