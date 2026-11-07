import importlib.util
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('refresh', 'scripts/refresh.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class RefreshTests(unittest.TestCase):
    def test_eia_blank_days_and_dates(self):
        html = '<table><tr><td>2026 Nov- 2 to Nov- 6</td><td>107.39</td><td>107.03</td><td></td><td>NA</td><td>-</td></tr></table>Release Date: 11/4/2026'
        points, released = mod.parse_eia(html, date(2026,11,7))
        self.assertEqual(points,[{'date':'2026-11-02','value':107.39},{'date':'2026-11-03','value':107.03}])
        self.assertEqual(released,'2026-11-04')
        points,_=mod.parse_eia(html,date(2026,11,2))
        self.assertEqual(len(points),1)

    def test_eia_year_crossing(self):
        html='<tr><td>2025 Dec-29 to Jan- 2</td><td>1.00</td><td>2.00</td><td>3.00</td><td>4.00</td><td>5.00</td></tr>'
        points,_=mod.parse_eia(html,date(2026,1,5))
        self.assertEqual(points[-1]['date'],'2026-01-02')

    def test_reject_empty_and_invalid(self):
        for html in ['', '<tr><td>not an EIA row</td></tr>', '<tr><td>2026 Nov- 2 to Nov- 6</td><td>NA</td><td>0.00</td><td>-</td><td>-</td><td>-</td></tr>']:
            with self.assertRaises(ValueError): mod.parse_eia(html,date(2026,11,7))

    def test_public_prices_do_not_substitute_premium(self):
        payload={'pricesAvailable':True,'stations':[{'fuels':[
            {'title':'A-95','grade':'premium','price':'99'},
            {'title':'А-98','grade':'super','price':'96.9'},
            {'title':'A-95','grade':'euro','price':'85.5'},
            {'title':'ДП+','grade':'premium','price':'102'},
            {'title':'ДП','grade':'euro','price':'101.9'},
            {'title':'LPG','grade':'extra','price':'58.64'}]}]}
        data=mod.parse_station_prices(payload)
        self.assertEqual(data['a95']['min'],85.5)
        self.assertEqual(data['a98']['min'],96.9)
        self.assertEqual(data['diesel']['min'],101.9)
        self.assertEqual(data['lpg']['stations'],1)
        payload['stations'][0]['fuels']=[{'title':'A-95','grade':'premium','price':'99'}]
        with self.assertRaises(ValueError):mod.parse_station_prices(payload)

    def test_public_price_range_and_bad_values(self):
        stations=[{'fuels':[{'title':'LPG','grade':'extra','price':v}]} for v in ['58,64','59.34','NaN','-1','',None]]
        self.assertEqual(mod.parse_station_prices({'pricesAvailable':True,'stations':stations})['lpg'],{'min':58.64,'max':59.34,'stations':2})
        with self.assertRaises(ValueError):mod.parse_station_prices({'pricesAvailable':False,'stations':stations})

    def test_failure_retains_old_cache_and_flags_error(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'market.json'
            previous={'fx':{'status':'ok','fetchedAt':'2026-11-01T12:00:00+02:00','rates':[{'code':'USD','value':40,'date':'2026-11-01'}]},'energy':{}}
            target.write_text(json.dumps(previous))
            with patch.object(mod,'TARGET',target),patch.object(mod,'fetch',side_effect=TimeoutError): mod.refresh()
            actual=json.loads(target.read_text())
            self.assertEqual(actual['fx']['rates'],previous['fx']['rates'])
            self.assertEqual(actual['fx']['fetchedAt'],previous['fx']['fetchedAt'])
            self.assertEqual(actual['fx']['status'],'error')
            self.assertEqual(len(actual['errors']),4)

if __name__=='__main__': unittest.main()
