import { ElementRef, FC, useRef, useState, lazy, Suspense  } from 'react';
import { QueryClient, QueryClientProvider } from "react-query";

import useWeb3Modal from "@blockchain-carbon-accounting/react-app/src/hooks/useWeb3Modal";
import NavigationBar from "@blockchain-carbon-accounting/react-app/src/components/navigation-bar";
import { Link, Route, Switch, Redirect, useLocation } from "wouter"

import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Tab from 'react-bootstrap/Tab';

import './App.css';

import { trpc, useTrpcClient } from "@blockchain-carbon-accounting/react-app/src/services/trpc";
const SignUp = lazy(() => import("@blockchain-carbon-accounting/react-app/src/pages/sign-up"));
const SignIn = lazy(() => import("@blockchain-carbon-accounting/react-app/src/pages/sign-in"));

const AppFooter = lazy(() => import("./components/footer"));
// lazy load routes
const Operators = lazy(() => import("./pages/operators"));
const Operator = lazy(() => import("./pages/operator"));
const Assets = lazy(() => import("./pages/assets"));
const TermsOfUse = lazy(() => import("./pages/terms"));

const App:FC = () => {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useTrpcClient();

  const { provider, loadWeb3Modal, logoutOfWeb3Modal, loadWalletInfo, logoutOfWalletInfo, signedInAddress, signedInWallet, roles,  limitedMode, /*refresh,*/ loaded } = useWeb3Modal();

  const [location] = useLocation();
  const operatorsRef = useRef<ElementRef<typeof Operators>>(null);

  useState(async() => {
    const sayHello = async() => {
      //const response = await fetch("/api/hello");
      //const body = await response.json();
      //console.log(body);
    };
    sayHello();
  });
  return (<>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <NavigationBar 
          brand={'Oil & Gas Emissions Data'}
          provider={provider}
          loadWeb3Modal={loadWeb3Modal}
          logoutOfWeb3Modal={logoutOfWeb3Modal}
          logoutOfWalletInfo={logoutOfWalletInfo}
          signedInAddress={signedInAddress}
          signedInWallet={signedInWallet}
          roles={roles}
          limitedMode={limitedMode}/>
        { loaded ? <>
          {/* Tabs to pages, only displayed when the user is signed in */}
          { signedInAddress && (
            <Nav fill variant="tabs" className="mt-2 mb-4 border-bottom-0">
              {/* On operators page, click this link to refresh the balances */}
              {/* Else on other page, click this link to go to operators */}
              {(location.substring(1) === "operators")
                ? <Nav.Link onClick={() => operatorsRef.current?.refresh()}   eventKey="operators">Operators</Nav.Link>
                : <Link href="/operators"><Nav.Link eventKey="operators">Operators  </Nav.Link></Link>
              }
            </Nav>)
          }
          <Container className="my-2 main-container">
            <Tab.Container defaultActiveKey={location.substring(1) || "operators"}  >
              <Tab.Content>
                <Suspense fallback={<p>Loading ...</p>}>
                  { signedInAddress ? (
                    <Switch>
                      <Route path="/"><Redirect to="/operators" /></Route>
                      <Route path="/dashboard"><Redirect to="/operators" /></Route  >
                      <Route path="/operators">
                        <Operators ref={operatorsRef} signedInAddress={ signedInAddress}/>
                      </Route>
                      <Route path="/operator/:operatorUuid?">{(params)=>
                        <Operator provider={provider} roles={roles} signedInAddress={signedInAddress} signedInWallet={signedInWallet} operatorUuid={params.operatorUuid} />
                      }
                      </Route>
                      <Route path="/assets/:operatorUuid?">{(params)=>
                        <Assets signedInAddress={signedInAddress} signedInWallet={signedInWallet} operatorUuid={params.operatorUuid}/>
                      }
                      </Route>
                      <Route path="/terms">
                        <TermsOfUse></TermsOfUse>
                      </Route>
                    </Switch>
                  ) : (
                    <Switch>
                      <Route path="/"><Redirect to="/operators" /></Route>
                      <Route path="/operators">
                        <Operators ref={operatorsRef} signedInAddress={ signedInAddress}/>
                      </Route>
                      <Route path="/sign-up">
                        <SignUp></SignUp>
                      </Route>
                      <Route path="/sign-in">
                        <SignIn loadWalletInfo={loadWalletInfo} />
                      </Route>
                      <Route path="/terms">
                        <TermsOfUse></TermsOfUse>
                      </Route>
                    </Switch>
                  )
                }
                </Suspense>
              </Tab.Content>
            </Tab.Container>
            <div className="my-5"></div>
          </Container>
        </> : <p>Loading ...</p>}
      </QueryClientProvider>
      <footer>
        <AppFooter></AppFooter>
      </footer>
    </trpc.Provider>
  </>);
}

export default App;
