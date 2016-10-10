import route from 'boulevard';
import url from 'url';
import rawBody from 'raw-body';
import qs from 'qs';
import {send} from 'micro';

const formBody = req => rawBody(req, {encoding: 'utf8'}).then(qs.parse);
const redirect = (res, location, status = 302) => {
	res.setHeader('location', location);
	return send(res, status, `Redirected to ${location}`);
};

const blogs = {};

const html = (res, t, status = 200) => {
	res.setHeader('content-type', 'text/html;charset=utf-8');
	send(res, status, t);
};

const blogForm = (id = '', {title = '', excerpt = ''} = {}) => `<form action="/blog/${id}" method="POST">
	<input value="${title}" name="title" placeholder="Title">
	<input value="${excerpt}" name="excerpt" placeholder="Excerpt">
	<input type="submit" value="Update title">
</form>`;

export default route({
	'/' (req, res) {
		return html(res, `<ul>
			${Object.keys(blogs).map(key => `<li><a href="/blog/${key}">${blogs[key].meta.title}</a></li>`).join('\n')}
			<li>Create blog: ${blogForm()}</li>
		</ul>`);
	},

	async '/blog' (req, res) {
		switch(req.method) {
			case 'POST': {
				const id = Math.floor(Math.random() * 0xffffffffff).toString(36);
				const body = await formBody(req);
				blogs[id] = {
					catchup: [],
					config: {
						baseurl: `${process.env.NOW_URL || 'http://localhost:3000'}/blog/${id}`,
						authornamestyle: 'full',
						contentorder: 'descending',
					},
					meta: {
						title: body.title,
						excerpt: body.excerpt,
						status: 'pending',
					}
				};

				return redirect(res, `/blog/${id}`);
			}
		}
	},

	'/blog/:id' (req, res, params) {
		const blog = blogs[params.id];
		if(!blog) return html(res, `<a href="/">↩</a> blog ${params.id} not found`);

		const {query = {}} = url.parse(req.url, true);

		switch(query.action) {
			case 'catchup': {
				return blog.catchup;
			}

			case 'getconfig': {
				return blog.config;
			}

			case 'getmeta': {
				return blog.meta;
			}

			default: {
				return html(res, `
					<a href="/">↩</a>
					<article>
					${blogForm(params.id, blog.meta)}

					<hr>
					<ul>
					${blog.catchup.map(event => {

					})}
					<hr>
					<li>
						<form action="/blog/${params.id}" method="PUT">
							<input name="msg" placeholder="Message"><input type="submit" value="">
						</form>
					</li>
					</ul>
				</article>`);
			}
		}
	}
});
