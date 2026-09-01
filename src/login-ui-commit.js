const TOKEN_KEY = "crm-telecaller-session-token";
const USER_KEY = "crm-current-user";

function currentUser(){
  return window.CRM_SESSION?.user?.() || localStorage.getItem(USER_KEY) || "";
}

function commitAcceptedLogin(){
  const token = localStorage.getItem(TOKEN_KEY) || "";
  if(!token) return false;
  const gate = document.querySelector("#staff-login-gate");
  if(!gate) return false;

  const user = currentUser();
  gate.classList.remove("show");
  gate.setAttribute("aria-hidden","true");
  document.body.classList.add("staff-session-active");
  document.body.classList.toggle("tc-session-active", user === "Telecaller 1" || user === "Telecaller 2");

  const selector = document.querySelector("#crm-user-select");
  if(selector && user){ selector.value = user; selector.disabled = true; }

  const error = document.querySelector("#tc-login-error");
  if(error) error.textContent = "";
  return true;
}

window.addEventListener("crm-session-login",()=>{
  commitAcceptedLogin();
  setTimeout(()=>window.dispatchEvent(new Event("crm-login-ui-ready")),0);
});

// Mobile Safari / Android embedded browsers can persist the accepted token before
// the async UI continuation completes. If that happens, finish the visual login
// immediately instead of forcing the user to refresh the page.
let tries = 0;
const watcher = setInterval(()=>{
  tries += 1;
  const gate = document.querySelector("#staff-login-gate");
  if(gate?.classList.contains("show") && localStorage.getItem(TOKEN_KEY)){
    if(commitAcceptedLogin()){
      window.dispatchEvent(new CustomEvent("crm-session-login",{detail:window.CRM_SESSION?.session?.()||{user_label:currentUser()}}));
    }
  }
  if(tries >= 300) clearInterval(watcher);
},100);

document.addEventListener("visibilitychange",()=>{
  if(!document.hidden) commitAcceptedLogin();
});
